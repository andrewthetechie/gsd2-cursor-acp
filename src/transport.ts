import { EventEmitter } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface, type Interface } from "node:readline";

import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  JsonRpcServerRequest,
  PendingRequest,
  TransportOptions,
} from "./types.js";
import { DEFAULT_TRANSPORT_OPTIONS } from "./types.js";
import {
  TransportError,
  ProcessCrashError,
  RequestTimeoutError,
  JsonRpcError,
} from "./errors.js";

/**
 * AcpTransport - JSON-RPC 2.0 transport over stdio to cursor-agent acp.
 *
 * Manages a single long-lived child process, correlates requests/responses
 * by numeric message ID, and routes inbound messages by type:
 *   - Response (has id + result/error) -> resolves/rejects pending request
 *   - Notification (has method, no id) -> emits "notification" event
 *   - Server-initiated request (has method + id) -> emits "request" event
 *
 * Events:
 *   "notification"  - JsonRpcNotification received from server
 *   "request"       - JsonRpcServerRequest received (caller should sendResponse)
 *   "error"         - Fatal error (e.g., ProcessCrashError after repeated crashes)
 *   "warning"       - Non-fatal issue (e.g., unparseable line from stdout)
 *   "restarting"    - Process crashed, auto-restarting (D-03)
 *   "started"       - Process (re)started successfully
 */
export class AcpTransport extends EventEmitter {
  private readonly options: Required<TransportOptions>;
  private process: ChildProcess | null = null;
  private rl: Interface | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private shuttingDown = false;
  private lastCrashTime: number | null = null;
  private crashCount = 0;

  // Bound handlers for host process cleanup (so we can remove them)
  private readonly boundCleanup: () => void;

  constructor(options?: TransportOptions) {
    super();
    this.options = { ...DEFAULT_TRANSPORT_OPTIONS, ...options };
    this.boundCleanup = () => this.shutdownSync();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Spawn the cursor-agent acp child process and set up line parsing. */
  async start(): Promise<void> {
    if (this.process && !this.process.killed) {
      return; // already running
    }

    this.shuttingDown = false;
    this.spawnProcess();
  }

  /**
   * Send a JSON-RPC 2.0 request and return a promise for the response.
   * The promise is rejected on timeout or if the server returns an error.
   */
  async sendRequest(method: string, params?: unknown): Promise<unknown> {
    this.ensureRunning();

    const id = this.nextId++;
    const message: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    };

    this.writeMessage(message);

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RequestTimeoutError(method, this.options.requestTimeout));
      }, this.options.requestTimeout);

      this.pending.set(id, { resolve, reject, timer, method });
    });
  }

  /** Respond to a server-initiated request (e.g., session/request_permission). */
  sendResponse(id: number | string, result: unknown): void {
    this.ensureRunning();
    this.writeMessage({ jsonrpc: "2.0", id, result });
  }

  /** Send a notification (no response expected). */
  sendNotification(method: string, params?: unknown): void {
    this.ensureRunning();
    const message: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      ...(params !== undefined ? { params } : {}),
    };
    this.writeMessage(message);
  }

  /**
   * Graceful shutdown per D-04:
   * 1. Reject all pending requests.
   * 2. Send SIGTERM.
   * 3. Wait up to shutdownTimeout ms for exit.
   * 4. If still alive, send SIGKILL.
   */
  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    this.rejectAllPending(new TransportError("Transport shutting down"));
    this.cleanupReadline();
    this.removeHostProcessHandlers();

    if (!this.process || this.process.killed) {
      this.process = null;
      return;
    }

    const proc = this.process;
    this.process = null;

    proc.kill("SIGTERM");

    await Promise.race([
      new Promise<void>((resolve) => proc.once("exit", () => resolve())),
      new Promise<void>((resolve) =>
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill("SIGKILL");
          }
          resolve();
        }, this.options.shutdownTimeout),
      ),
    ]);
  }

  /** Check if the child process is alive. */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private spawnProcess(): void {
    const proc = spawn(
      this.options.binaryPath,
      this.options.binaryArgs,
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    this.process = proc;

    // Set up readline for line-delimited JSON parsing on stdout
    this.rl = createInterface({ input: proc.stdout! });
    this.rl.on("line", (line: string) => this.handleLine(line));

    // Process lifecycle events
    proc.on("exit", (code: number | null, signal: string | null) => {
      this.handleProcessExit(code, signal);
    });

    proc.on("error", (err: Error) => {
      this.emit("error", new TransportError(err.message));
    });

    // Register host process cleanup handlers
    this.registerHostProcessHandlers();

    this.emit("started");
  }

  /**
   * Parse a line from stdout as JSON-RPC 2.0 and route it.
   *
   * Routing priority:
   *   1. Has `id` AND (`result` !== undefined OR `error` exists) -> response
   *   2. Has `method` AND `id` -> server-initiated request
   *   3. Has `method` (no `id`) -> notification
   */
  private handleLine(line: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch {
      this.emit("warning", `Unparseable line from stdout: ${line}`);
      return;
    }

    // 1. Response to our request
    if (
      msg.id !== undefined &&
      (msg.result !== undefined || msg.error !== undefined)
    ) {
      this.handleResponse(msg as unknown as JsonRpcResponse);
      return;
    }

    // 2. Server-initiated request (has method + id)
    if (msg.method !== undefined && msg.id !== undefined) {
      this.emit("request", msg as unknown as JsonRpcServerRequest);
      return;
    }

    // 3. Notification (has method, no id)
    if (msg.method !== undefined) {
      this.emit("notification", msg as unknown as JsonRpcNotification);
      return;
    }

    // Unrecognized message shape -- warn and discard
    this.emit("warning", `Unrecognized message shape: ${line}`);
  }

  private handleResponse(response: JsonRpcResponse): void {
    // Our internal IDs are numbers, but accept string/number for robustness
    const id =
      typeof response.id === "string"
        ? parseInt(response.id, 10)
        : response.id;

    if (typeof id !== "number" || isNaN(id)) {
      return; // cannot correlate
    }

    const pending = this.pending.get(id);
    if (!pending) {
      // Unmatched response -- discard silently (no crash, per TRAN-03)
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(id);

    if (response.error) {
      pending.reject(
        new JsonRpcError(
          response.error.message,
          response.error.code,
          response.error.data,
        ),
      );
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * Handle unexpected child process exit (D-03 crash/restart logic).
   *
   * - If shutting down, ignore.
   * - If outside crash window (>crashWindowMs since last crash), reset counter.
   * - First crash in window: auto-restart once.
   * - Second crash in window: emit fatal error, do NOT restart.
   */
  private handleProcessExit(
    code: number | null,
    signal: string | null,
  ): void {
    if (this.shuttingDown) return;

    const now = Date.now();

    // Reset crash counter if outside window
    if (
      this.lastCrashTime !== null &&
      now - this.lastCrashTime > this.options.crashWindowMs
    ) {
      this.crashCount = 0;
    }

    this.crashCount++;
    this.lastCrashTime = now;

    if (this.crashCount > this.options.maxRestartsInWindow) {
      // Fatal -- reject all pending, emit error
      const err = new ProcessCrashError(
        `Process crashed ${this.crashCount} times within ${this.options.crashWindowMs}ms`,
        code,
        signal,
      );
      this.rejectAllPending(err);
      this.emit("error", err);
      return;
    }

    // Auto-restart once
    this.cleanupReadline();
    this.emit("restarting");
    this.spawnProcess();
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private writeMessage(msg: object): void {
    if (!this.process?.stdin || this.process.stdin.destroyed) {
      throw new TransportError("Cannot write: process stdin not available");
    }
    this.process.stdin.write(JSON.stringify(msg) + "\n");
  }

  private ensureRunning(): void {
    if (!this.process || this.process.killed) {
      throw new TransportError("Transport is not running. Call start() first.");
    }
  }

  private rejectAllPending(error: Error): void {
    for (const [id, req] of this.pending) {
      clearTimeout(req.timer);
      req.reject(error);
    }
    this.pending.clear();
  }

  private cleanupReadline(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  private registerHostProcessHandlers(): void {
    process.on("exit", this.boundCleanup);
    process.on("SIGTERM", this.boundCleanup);
    process.on("SIGINT", this.boundCleanup);
  }

  private removeHostProcessHandlers(): void {
    process.removeListener("exit", this.boundCleanup);
    process.removeListener("SIGTERM", this.boundCleanup);
    process.removeListener("SIGINT", this.boundCleanup);
  }

  /** Synchronous cleanup for use in process exit handlers. */
  private shutdownSync(): void {
    this.shuttingDown = true;
    this.rejectAllPending(new TransportError("Host process exiting"));
    if (this.process && !this.process.killed) {
      this.process.kill("SIGTERM");
    }
  }
}
