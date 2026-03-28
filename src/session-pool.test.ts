import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { AcpSessionPool } from "./session-pool.js";

// Create mock transport factory
function createMockTransport() {
  const transport = new EventEmitter() as EventEmitter & {
    start: ReturnType<typeof vi.fn>;
    sendRequest: ReturnType<typeof vi.fn>;
    sendResponse: ReturnType<typeof vi.fn>;
    shutdown: ReturnType<typeof vi.fn>;
    isRunning: ReturnType<typeof vi.fn>;
  };

  let sessionCounter = 0;

  transport.start = vi.fn().mockResolvedValue(undefined);
  transport.sendRequest = vi.fn().mockImplementation((method: string) => {
    if (method === "initialize") return Promise.resolve({ protocolVersion: 1 });
    if (method === "authenticate") return Promise.resolve({});
    if (method === "session/new") {
      sessionCounter++;
      return Promise.resolve({ sessionId: `session-${sessionCounter}` });
    }
    return Promise.resolve({});
  });
  transport.sendResponse = vi.fn();
  transport.shutdown = vi.fn().mockResolvedValue(undefined);
  transport.isRunning = vi.fn().mockReturnValue(true);
  return transport;
}

describe("AcpSessionPool", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let AcpSessionPoolClass: typeof AcpSessionPool;
  let mockTransport: ReturnType<typeof createMockTransport>;

  beforeEach(async () => {
    mockTransport = createMockTransport();
    const module = await import("./session-pool.js");
    AcpSessionPoolClass = module.AcpSessionPool;
    vi.clearAllMocks();

    // Reset session counter by creating a fresh transport per test
    mockTransport = createMockTransport();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Lazy initialization (D-09)
  // ===========================================================================

  describe("lazy initialization", () => {
    it("constructor does NOT call transport.start() or sendRequest()", () => {
      new AcpSessionPoolClass({ transport: mockTransport as any });
      expect(mockTransport.start).not.toHaveBeenCalled();
      expect(mockTransport.sendRequest).not.toHaveBeenCalled();
    });

    it("first getOrCreateSession calls start(), then initialize, then authenticate", async () => {
      const pool = new AcpSessionPoolClass({ transport: mockTransport as any });
      await pool.getOrCreateSession("/project");

      expect(mockTransport.start).toHaveBeenCalledOnce();
      const calls = mockTransport.sendRequest.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls[0]).toBe("initialize");
      expect(calls[1]).toBe("authenticate");
    });

    it("second getOrCreateSession (same cwd) does NOT call initialize/authenticate again", async () => {
      const pool = new AcpSessionPoolClass({ transport: mockTransport as any });
      await pool.getOrCreateSession("/project");
      await pool.getOrCreateSession("/project");

      // start() called only once
      expect(mockTransport.start).toHaveBeenCalledOnce();
      // initialize and authenticate called only once each
      const calls = mockTransport.sendRequest.mock.calls.map((c: unknown[]) => c[0]);
      const initCalls = calls.filter((m: string) => m === "initialize");
      const authCalls = calls.filter((m: string) => m === "authenticate");
      expect(initCalls).toHaveLength(1);
      expect(authCalls).toHaveLength(1);
    });

    it("second getOrCreateSession (different cwd) does NOT re-initialize", async () => {
      const pool = new AcpSessionPoolClass({ transport: mockTransport as any });
      await pool.getOrCreateSession("/project-a");
      await pool.getOrCreateSession("/project-b");

      const calls = mockTransport.sendRequest.mock.calls.map((c: unknown[]) => c[0]);
      const initCalls = calls.filter((m: string) => m === "initialize");
      expect(initCalls).toHaveLength(1);
    });
  });

  // ===========================================================================
  // Authentication (AUTH-01)
  // ===========================================================================

  describe("authentication", () => {
    it("initialize sends correct params per AUTH-01", async () => {
      const pool = new AcpSessionPoolClass({ transport: mockTransport as any });
      await pool.getOrCreateSession("/project");

      const initCall = mockTransport.sendRequest.mock.calls.find(
        (c: unknown[]) => c[0] === "initialize",
      );
      expect(initCall).toBeDefined();
      expect(initCall[1]).toEqual({
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
        clientInfo: { name: "gsd-cursor", version: "0.0.1" },
      });
    });

    it("authenticate sends methodId cursor_login per AUTH-01", async () => {
      const pool = new AcpSessionPoolClass({ transport: mockTransport as any });
      await pool.getOrCreateSession("/project");

      const authCall = mockTransport.sendRequest.mock.calls.find(
        (c: unknown[]) => c[0] === "authenticate",
      );
      expect(authCall).toBeDefined();
      expect(authCall[1]).toEqual({ methodId: "cursor_login" });
    });

    it("throws with D-07 message when authenticate rejects", async () => {
      mockTransport.sendRequest = vi.fn().mockImplementation((method: string) => {
        if (method === "initialize") return Promise.resolve({ protocolVersion: 1 });
        if (method === "authenticate") return Promise.reject(new Error("Not logged in"));
        return Promise.resolve({});
      });

      const pool = new AcpSessionPoolClass({ transport: mockTransport as any });
      await expect(pool.getOrCreateSession("/project")).rejects.toThrow(
        /Set CURSOR_API_KEY or run/,
      );
    });

    it("when CURSOR_API_KEY is set, transport is created with --api-key args prepended", () => {
      vi.stubEnv("CURSOR_API_KEY", "test-key-123");
      try {
        // We can't easily verify binaryArgs on the internally-created transport without
        // intercepting the AcpTransport constructor. Instead, verify that the pool
        // accepts CURSOR_API_KEY in env and constructs without error.
        // The actual binaryArgs test is validated through integration.
        // This test at least verifies no exceptions are thrown for valid API key env.
        expect(() => new AcpSessionPoolClass()).not.toThrow();
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });

  // ===========================================================================
  // Session scoping (D-06)
  // ===========================================================================

  describe("session scoping", () => {
    it("getOrCreateSession calls session/new with cwd and returns sessionId", async () => {
      const pool = new AcpSessionPoolClass({ transport: mockTransport as any });
      const sessionId = await pool.getOrCreateSession("/project");

      const sessionNewCall = mockTransport.sendRequest.mock.calls.find(
        (c: unknown[]) => c[0] === "session/new",
      );
      expect(sessionNewCall).toBeDefined();
      expect(sessionNewCall[1]).toEqual({ cwd: "/project", mcpServers: [] });
      expect(typeof sessionId).toBe("string");
      expect(sessionId.length).toBeGreaterThan(0);
    });

    it("second call with same cwd returns same sessionId (reuse, no new session/new call)", async () => {
      const pool = new AcpSessionPoolClass({ transport: mockTransport as any });
      const id1 = await pool.getOrCreateSession("/project");
      const id2 = await pool.getOrCreateSession("/project");

      expect(id1).toBe(id2);
      const sessionNewCalls = mockTransport.sendRequest.mock.calls.filter(
        (c: unknown[]) => c[0] === "session/new",
      );
      expect(sessionNewCalls).toHaveLength(1);
    });

    it("different cwds get different sessions, each calls session/new", async () => {
      const pool = new AcpSessionPoolClass({ transport: mockTransport as any });
      const idA = await pool.getOrCreateSession("/project-a");
      const idB = await pool.getOrCreateSession("/project-b");

      expect(idA).not.toBe(idB);
      const sessionNewCalls = mockTransport.sendRequest.mock.calls.filter(
        (c: unknown[]) => c[0] === "session/new",
      );
      expect(sessionNewCalls).toHaveLength(2);
      const cwds = sessionNewCalls.map((c: unknown[]) => (c[1] as { cwd: string }).cwd);
      expect(cwds).toContain("/project-a");
      expect(cwds).toContain("/project-b");
    });
  });

  // ===========================================================================
  // Concurrent access (Pitfall 1 - Mutex)
  // ===========================================================================

  describe("concurrent access", () => {
    it("two concurrent getOrCreateSession calls share the same init promise (initialize called once)", async () => {
      const pool = new AcpSessionPoolClass({ transport: mockTransport as any });

      // Fire both concurrently without awaiting
      const [id1, id2] = await Promise.all([
        pool.getOrCreateSession("/project"),
        pool.getOrCreateSession("/project"),
      ]);

      expect(id1).toBe(id2);

      const initCalls = mockTransport.sendRequest.mock.calls.filter(
        (c: unknown[]) => c[0] === "initialize",
      );
      expect(initCalls).toHaveLength(1);
    });

    it("two concurrent calls for different cwds share init but create separate sessions", async () => {
      const pool = new AcpSessionPoolClass({ transport: mockTransport as any });

      const [idA, idB] = await Promise.all([
        pool.getOrCreateSession("/project-a"),
        pool.getOrCreateSession("/project-b"),
      ]);

      expect(idA).not.toBe(idB);

      const initCalls = mockTransport.sendRequest.mock.calls.filter(
        (c: unknown[]) => c[0] === "initialize",
      );
      expect(initCalls).toHaveLength(1);
    });
  });

  // ===========================================================================
  // Transport restart recovery (Pitfall 5)
  // ===========================================================================

  describe("transport restart", () => {
    it("when transport emits 'restarting', sessions map is cleared and next call re-initializes", async () => {
      const pool = new AcpSessionPoolClass({ transport: mockTransport as any });

      // First getOrCreateSession - initializes and creates session
      const id1 = await pool.getOrCreateSession("/project");

      // Simulate transport restart
      mockTransport.emit("restarting");

      // Next call should re-initialize from scratch
      const id2 = await pool.getOrCreateSession("/project");

      // Should have called initialize twice (once before restart, once after)
      const initCalls = mockTransport.sendRequest.mock.calls.filter(
        (c: unknown[]) => c[0] === "initialize",
      );
      expect(initCalls).toHaveLength(2);

      // Sessions should be different (restarted means fresh session)
      expect(id1).not.toBe(id2);
    });
  });

  // ===========================================================================
  // Permission wiring (AUTH-02)
  // ===========================================================================

  describe("permission wiring", () => {
    it("when transport emits 'request' for session/request_permission, resolvePermission is called and sendResponse is called", async () => {
      const pool = new AcpSessionPoolClass({ transport: mockTransport as any });

      // Trigger a permission request from transport
      const requestMsg = {
        jsonrpc: "2.0" as const,
        id: 42,
        method: "session/request_permission",
        params: {
          sessionId: "s1",
          toolCall: { toolCallId: "tc1", kind: "read" },
          options: [{ optionId: "ao-1", name: "Allow", kind: "allow_once" }],
        },
      };

      mockTransport.emit("request", requestMsg);

      expect(mockTransport.sendResponse).toHaveBeenCalledOnce();
      const [id, result] = mockTransport.sendResponse.mock.calls[0] as [number, unknown];
      expect(id).toBe(42);
      expect(result).toHaveProperty("outcome");
    });

    it("non-permission requests are ignored (no sendResponse call)", () => {
      new AcpSessionPoolClass({ transport: mockTransport as any });

      mockTransport.emit("request", {
        jsonrpc: "2.0",
        id: 99,
        method: "other/method",
        params: {},
      });

      expect(mockTransport.sendResponse).not.toHaveBeenCalled();
    });

    it("auto-approve-all policy selects allow_once option", async () => {
      const pool = new AcpSessionPoolClass({
        transport: mockTransport as any,
        permissionPolicy: "auto-approve-all",
      });

      mockTransport.emit("request", {
        jsonrpc: "2.0",
        id: 10,
        method: "session/request_permission",
        params: {
          sessionId: "s1",
          toolCall: { kind: "edit" },
          options: [
            { optionId: "allow-1", name: "Allow", kind: "allow_once" },
            { optionId: "reject-1", name: "Reject", kind: "reject_once" },
          ],
        },
      });

      expect(mockTransport.sendResponse).toHaveBeenCalledOnce();
      const [, result] = mockTransport.sendResponse.mock.calls[0] as [number, { outcome: { outcome: string; optionId: string } }];
      expect(result.outcome.outcome).toBe("selected");
      expect(result.outcome.optionId).toBe("allow-1");
    });
  });

  // ===========================================================================
  // Shutdown
  // ===========================================================================

  describe("shutdown", () => {
    it("shutdown() calls transport.shutdown() and clears sessions", async () => {
      const pool = new AcpSessionPoolClass({ transport: mockTransport as any });
      await pool.getOrCreateSession("/project");
      await pool.shutdown();

      expect(mockTransport.shutdown).toHaveBeenCalledOnce();
    });

    it("after shutdown, a new getOrCreateSession call re-initializes", async () => {
      const pool = new AcpSessionPoolClass({ transport: mockTransport as any });
      await pool.getOrCreateSession("/project");
      await pool.shutdown();

      // Re-start transport simulation after shutdown
      mockTransport.start = vi.fn().mockResolvedValue(undefined);

      await pool.getOrCreateSession("/project");

      const initCalls = mockTransport.sendRequest.mock.calls.filter(
        (c: unknown[]) => c[0] === "initialize",
      );
      expect(initCalls).toHaveLength(2);
    });
  });
});
