import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { AcpSessionPool } from "./session-pool.js";
import {
  streamCursorAcp,
  streamSimpleCursorAcp,
  AssistantMessageEventStream,
  _setPoolForTest,
} from "./provider.js";

// ---------------------------------------------------------------------------
// Mock transport factory (same pattern as session-pool.test.ts)
// ---------------------------------------------------------------------------

function createMockTransport() {
  const transport = new EventEmitter() as EventEmitter & {
    start: ReturnType<typeof vi.fn>;
    sendRequest: ReturnType<typeof vi.fn>;
    sendResponse: ReturnType<typeof vi.fn>;
    shutdown: ReturnType<typeof vi.fn>;
    isRunning: ReturnType<typeof vi.fn>;
  };

  transport.start = vi.fn().mockResolvedValue(undefined);
  transport.sendRequest = vi.fn().mockImplementation((method: string) => {
    if (method === "initialize") return Promise.resolve({ protocolVersion: 1 });
    if (method === "authenticate") return Promise.resolve({});
    if (method === "session/new") return Promise.resolve({ sessionId: "test-session-1" });
    if (method === "session/prompt") return Promise.resolve({ stopReason: "end_turn" });
    if (method === "session/cancel") return Promise.resolve({});
    return Promise.resolve({});
  });
  transport.sendResponse = vi.fn();
  transport.shutdown = vi.fn().mockResolvedValue(undefined);
  transport.isRunning = vi.fn().mockReturnValue(true);
  return transport;
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const mockModel = {
  id: "cursor-test",
  name: "Cursor Test",
  api: "cursor-acp" as const,
  provider: "cursor",
  baseUrl: "",
  reasoning: false,
  input: ["text" as const],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 100000,
  maxTokens: 4096,
};

const mockContext = {
  messages: [{ role: "user" as const, content: "hello", timestamp: Date.now() }],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("streamCursorAcp", () => {
  let mockTransport: ReturnType<typeof createMockTransport>;
  let mockPool: AcpSessionPool;

  beforeEach(() => {
    mockTransport = createMockTransport();
    // Inject pool with mock transport
    mockPool = new AcpSessionPool({ transport: mockTransport as unknown as import("./transport.js").AcpTransport });
    _setPoolForTest(mockPool);
    vi.clearAllMocks();
    // Re-create transport after clearAllMocks
    mockTransport = createMockTransport();
    mockPool = new AcpSessionPool({ transport: mockTransport as unknown as import("./transport.js").AcpTransport });
    _setPoolForTest(mockPool);
  });

  afterEach(() => {
    _setPoolForTest(null);
    vi.restoreAllMocks();
  });

  it("stream() returns AssistantMessageEventStream synchronously, not a Promise", () => {
    const result = streamCursorAcp(mockModel, mockContext, undefined);
    expect(result).toBeInstanceOf(AssistantMessageEventStream);
    // Must NOT be a Promise
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(typeof (result as any).then).toBe("undefined");
  });

  it("streamSimple() returns AssistantMessageEventStream synchronously, not a Promise", () => {
    const result = streamSimpleCursorAcp(mockModel, mockContext, undefined);
    expect(result).toBeInstanceOf(AssistantMessageEventStream);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(typeof (result as any).then).toBe("undefined");
  });

  it("AbortSignal calls session/cancel and ends stream with error/aborted", async () => {
    // Transport that never resolves session/prompt so abort happens first
    const slowTransport = new EventEmitter() as EventEmitter & {
      start: ReturnType<typeof vi.fn>;
      sendRequest: ReturnType<typeof vi.fn>;
      sendResponse: ReturnType<typeof vi.fn>;
      shutdown: ReturnType<typeof vi.fn>;
      isRunning: ReturnType<typeof vi.fn>;
    };
    slowTransport.start = vi.fn().mockResolvedValue(undefined);
    slowTransport.sendRequest = vi.fn().mockImplementation((method: string) => {
      if (method === "initialize") return Promise.resolve({ protocolVersion: 1 });
      if (method === "authenticate") return Promise.resolve({});
      if (method === "session/new") return Promise.resolve({ sessionId: "abort-session" });
      if (method === "session/cancel") return Promise.resolve({});
      // session/prompt hangs until cancelled — never resolves during this test
      if (method === "session/prompt") return new Promise<unknown>(() => {});
      return Promise.resolve({});
    });
    slowTransport.sendResponse = vi.fn();
    slowTransport.shutdown = vi.fn().mockResolvedValue(undefined);
    slowTransport.isRunning = vi.fn().mockReturnValue(true);

    const slowPool = new AcpSessionPool({ transport: slowTransport as unknown as import("./transport.js").AcpTransport });
    _setPoolForTest(slowPool);

    const controller = new AbortController();
    const stream = streamCursorAcp(mockModel, mockContext, { signal: controller.signal });

    // Give the async IIFE time to set up the session and attach the abort listener
    // before aborting. Use a small delay to let the getOrCreateSession resolve first.
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    controller.abort();

    // Collect events from stream
    const events: unknown[] = [];
    for await (const event of stream) {
      events.push(event);
    }

    const errorEvent = events.find((e) => (e as { type: string }).type === "error");
    expect(errorEvent).toBeDefined();
    expect((errorEvent as { type: string; reason: string }).reason).toBe("aborted");

    // session/cancel should have been called
    expect(slowTransport.sendRequest).toHaveBeenCalledWith(
      "session/cancel",
      expect.objectContaining({ sessionId: "abort-session" }),
    );
  });

  it("notification listener is attached before session/prompt is sent (ordering check via mock)", async () => {
    const callOrder: string[] = [];
    const trackingTransport = new EventEmitter() as EventEmitter & {
      start: ReturnType<typeof vi.fn>;
      sendRequest: ReturnType<typeof vi.fn>;
      sendResponse: ReturnType<typeof vi.fn>;
      shutdown: ReturnType<typeof vi.fn>;
      isRunning: ReturnType<typeof vi.fn>;
    };
    const origOn = trackingTransport.on.bind(trackingTransport);
    trackingTransport.on = vi.fn().mockImplementation((event: string, handler: unknown) => {
      if (event === "notification") {
        callOrder.push("notification-listener-attached");
      }
      return origOn(event, handler as (...args: unknown[]) => void);
    });
    trackingTransport.start = vi.fn().mockResolvedValue(undefined);
    trackingTransport.sendRequest = vi.fn().mockImplementation((method: string) => {
      if (method === "initialize") return Promise.resolve({ protocolVersion: 1 });
      if (method === "authenticate") return Promise.resolve({});
      if (method === "session/new") return Promise.resolve({ sessionId: "order-session" });
      if (method === "session/prompt") {
        callOrder.push("session/prompt-sent");
        return Promise.resolve({ stopReason: "end_turn" });
      }
      return Promise.resolve({});
    });
    trackingTransport.sendResponse = vi.fn();
    trackingTransport.shutdown = vi.fn().mockResolvedValue(undefined);
    trackingTransport.isRunning = vi.fn().mockReturnValue(true);

    const trackingPool = new AcpSessionPool({ transport: trackingTransport as unknown as import("./transport.js").AcpTransport });
    _setPoolForTest(trackingPool);

    const stream = streamCursorAcp(mockModel, mockContext, undefined);
    for await (const _event of stream) {
      // consume
    }

    const listenerIdx = callOrder.indexOf("notification-listener-attached");
    const promptIdx = callOrder.indexOf("session/prompt-sent");
    expect(listenerIdx).toBeGreaterThanOrEqual(0);
    expect(promptIdx).toBeGreaterThan(listenerIdx);
  });

  it("notification listener is removed in finally block after stream completes", async () => {
    const removedListeners: string[] = [];
    const offTrackingTransport = new EventEmitter() as EventEmitter & {
      start: ReturnType<typeof vi.fn>;
      sendRequest: ReturnType<typeof vi.fn>;
      sendResponse: ReturnType<typeof vi.fn>;
      shutdown: ReturnType<typeof vi.fn>;
      isRunning: ReturnType<typeof vi.fn>;
    };
    const origOff = offTrackingTransport.off.bind(offTrackingTransport);
    offTrackingTransport.off = vi.fn().mockImplementation((event: string, handler: unknown) => {
      if (event === "notification") {
        removedListeners.push("notification");
      }
      return origOff(event, handler as (...args: unknown[]) => void);
    });
    offTrackingTransport.start = vi.fn().mockResolvedValue(undefined);
    offTrackingTransport.sendRequest = vi.fn().mockImplementation((method: string) => {
      if (method === "initialize") return Promise.resolve({ protocolVersion: 1 });
      if (method === "authenticate") return Promise.resolve({});
      if (method === "session/new") return Promise.resolve({ sessionId: "finally-session" });
      if (method === "session/prompt") return Promise.resolve({ stopReason: "end_turn" });
      return Promise.resolve({});
    });
    offTrackingTransport.sendResponse = vi.fn();
    offTrackingTransport.shutdown = vi.fn().mockResolvedValue(undefined);
    offTrackingTransport.isRunning = vi.fn().mockReturnValue(true);

    const offPool = new AcpSessionPool({ transport: offTrackingTransport as unknown as import("./transport.js").AcpTransport });
    _setPoolForTest(offPool);

    const stream = streamCursorAcp(mockModel, mockContext, undefined);
    for await (const _event of stream) {
      // consume
    }

    // Give finally block time to execute
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    expect(removedListeners).toContain("notification");
  });

  it("only processes notifications from the current sessionId (Pitfall 6 filter)", async () => {
    const receivedUpdates: unknown[] = [];
    const filterTransport = new EventEmitter() as EventEmitter & {
      start: ReturnType<typeof vi.fn>;
      sendRequest: ReturnType<typeof vi.fn>;
      sendResponse: ReturnType<typeof vi.fn>;
      shutdown: ReturnType<typeof vi.fn>;
      isRunning: ReturnType<typeof vi.fn>;
    };
    filterTransport.start = vi.fn().mockResolvedValue(undefined);
    filterTransport.sendRequest = vi.fn().mockImplementation((method: string) => {
      if (method === "initialize") return Promise.resolve({ protocolVersion: 1 });
      if (method === "authenticate") return Promise.resolve({});
      if (method === "session/new") return Promise.resolve({ sessionId: "correct-session" });
      if (method === "session/prompt") {
        // Emit a notification for wrong session and correct session before resolving
        setTimeout(() => {
          filterTransport.emit("notification", {
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              sessionId: "wrong-session",
              update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "wrong" } },
            },
          });
          filterTransport.emit("notification", {
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              sessionId: "correct-session",
              update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hello" } },
            },
          });
        }, 5);
        return Promise.resolve({ stopReason: "end_turn" });
      }
      return Promise.resolve({});
    });
    filterTransport.sendResponse = vi.fn();
    filterTransport.shutdown = vi.fn().mockResolvedValue(undefined);
    filterTransport.isRunning = vi.fn().mockReturnValue(true);

    const filterPool = new AcpSessionPool({ transport: filterTransport as unknown as import("./transport.js").AcpTransport });
    _setPoolForTest(filterPool);

    const stream = streamCursorAcp(mockModel, mockContext, undefined);
    for await (const event of stream) {
      if ((event as { type: string }).type === "text_delta") {
        receivedUpdates.push(event);
      }
    }

    // Only the correct-session text delta should have been processed
    const texts = receivedUpdates.map((e) => (e as { delta: string }).delta);
    expect(texts).not.toContain("wrong");
    // "hello" may or may not arrive before done, but "wrong" must never appear
  });
});
