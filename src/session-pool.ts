import type { JsonRpcServerRequest, TransportOptions } from "./types.js";
import { AcpTransport } from "./transport.js";
import {
  PermissionHandler,
  type PermissionPolicy,
} from "./permission-handler.js";
import { CursorAuthError } from "./errors.js";

export type { PermissionPolicy };

export interface AcpSessionPoolOptions {
  /** Pre-configured AcpTransport instance. If not provided, one is created internally. */
  transport?: AcpTransport;
  /** Additional TransportOptions used when creating transport internally. */
  transportOptions?: TransportOptions;
  /** Permission policy. Default: 'auto-approve-all' per D-08. */
  permissionPolicy?: PermissionPolicy;
  /** Max cached sessions before LRU eviction. Default: 10. */
  maxSessions?: number;
  /** Session mode for session/new requests. Default: 'agent' (required for tool + thinking notifications per D-14). */
  sessionMode?: 'agent' | 'plan' | 'ask';
}

export class AcpSessionPool {
  readonly transport: AcpTransport;
  private readonly permissionHandler: PermissionHandler;
  private readonly maxSessions: number;
  private readonly sessionMode: 'agent' | 'plan' | 'ask';
  private initPromise: Promise<void> | null = null;
  private initialized = false;
  private readonly sessions = new Map<string, string>(); // cwd -> sessionId
  private readonly sessionAccess = new Map<string, number>(); // cwd -> last access timestamp (for LRU)
  private readonly sessionCreating = new Map<string, Promise<string>>(); // cwd -> in-flight session/new promise

  constructor(options: AcpSessionPoolOptions = {}) {
    // Build transport with API key handling per AUTH-01 + Pitfall 3
    if (options.transport) {
      this.transport = options.transport;
    } else {
      const apiKey = process.env.CURSOR_API_KEY;
      const baseArgs = options.transportOptions?.binaryArgs ?? ["acp"];
      const binaryArgs = apiKey ? ["--api-key", apiKey, ...baseArgs] : baseArgs;
      this.transport = new AcpTransport({
        ...options.transportOptions,
        binaryArgs,
      });
    }

    this.permissionHandler = new PermissionHandler(
      options.permissionPolicy ?? "auto-approve-all",
    );
    this.maxSessions = options.maxSessions ?? 10;
    this.sessionMode = options.sessionMode ?? 'agent';

    // Wire permission handling per Pattern 4 (AUTH-02)
    this.transport.on("request", (request: JsonRpcServerRequest) => {
      if (request.method === "session/request_permission") {
        const params = request.params as {
          sessionId: string;
          toolCall?: { kind?: string };
          options: Array<{ optionId: string; name: string; kind: string }>;
        };
        const outcome = this.permissionHandler.resolvePermission(
          params.toolCall?.kind,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          params.options as any,
        );
        this.transport.sendResponse(request.id, { outcome });
      }
    });

    // Wire transport restart recovery per Pitfall 5
    this.transport.on("restarting", () => {
      this.initialized = false;
      this.initPromise = null;
      this.sessions.clear();
      this.sessionAccess.clear();
    });

    // D-09: Constructor does NO I/O. No transport.start(), no sendRequest().
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Get or create a session for the given working directory.
   * Lazy-initializes the transport on first call (D-09).
   * Reuses existing sessions for the same cwd (D-06).
   */
  async getOrCreateSession(cwd: string): Promise<string> {
    await this.ensureInitialized();

    const existing = this.sessions.get(cwd);
    if (existing) {
      this.sessionAccess.set(cwd, Date.now());
      return existing;
    }

    // If a concurrent call is already creating a session for this cwd, share the promise
    const inFlight = this.sessionCreating.get(cwd);
    if (inFlight) {
      return inFlight;
    }

    const createPromise = this.doCreateSession(cwd);
    this.sessionCreating.set(cwd, createPromise);
    try {
      const sessionId = await createPromise;
      return sessionId;
    } finally {
      this.sessionCreating.delete(cwd);
    }
  }

  /**
   * Shut down the transport and clear all session state.
   */
  async shutdown(): Promise<void> {
    this.sessions.clear();
    this.sessionAccess.clear();
    this.initialized = false;
    this.initPromise = null;
    await this.transport.shutdown();
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Create a new session for the given cwd.
   * Handles LRU eviction before creating.
   */
  private async doCreateSession(cwd: string): Promise<string> {
    // LRU eviction if at max
    if (this.sessions.size >= this.maxSessions) {
      this.evictLeastRecentSession();
    }

    const result = (await this.transport.sendRequest("session/new", {
      cwd,
      mcpServers: [],
      mode: this.sessionMode,
    })) as { sessionId: string };

    this.sessions.set(cwd, result.sessionId);
    this.sessionAccess.set(cwd, Date.now());
    return result.sessionId;
  }

  /**
   * Ensure the transport is initialized exactly once (Pitfall 1 mutex).
   * Concurrent callers share the same initPromise.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (!this.initPromise) {
      this.initPromise = this.doInitialize();
    }
    await this.initPromise;
  }

  /**
   * Perform the ACP lifecycle initialization:
   * start() -> initialize -> authenticate (AUTH-01)
   */
  private async doInitialize(): Promise<void> {
    await this.transport.start();

    await this.transport.sendRequest("initialize", {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
      clientInfo: { name: "gsd-cursor", version: "0.0.1" },
    });

    try {
      await this.transport.sendRequest("authenticate", {
        methodId: "cursor_login",
      });
    } catch (error) {
      // D-07: Fail fast with clear message when not authenticated
      this.initPromise = null; // Allow retry after fixing auth
      throw new CursorAuthError(
        `Authentication failed. Set CURSOR_API_KEY or run \`cursor-agent login\`. ` +
          `Original error: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }

    this.initialized = true;
  }

  /**
   * Evict the least recently used session to stay under maxSessions.
   */
  private evictLeastRecentSession(): void {
    let oldestCwd: string | null = null;
    let oldestTime = Infinity;
    for (const [cwd, time] of this.sessionAccess) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestCwd = cwd;
      }
    }
    if (oldestCwd) {
      this.sessions.delete(oldestCwd);
      this.sessionAccess.delete(oldestCwd);
    }
  }
}
