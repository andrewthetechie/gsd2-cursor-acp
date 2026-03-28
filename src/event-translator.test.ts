import { describe, it, expect, vi, beforeEach } from "vitest";
import { AcpEventTranslator } from "./event-translator.js";

// ---------------------------------------------------------------------------
// Mock AssistantMessageEventStream
// ---------------------------------------------------------------------------

class MockStream {
  push = vi.fn();
  end = vi.fn();
}

// ---------------------------------------------------------------------------
// Mock Model<'cursor-acp'>
// ---------------------------------------------------------------------------

const mockModel = {
  id: "test-model",
  name: "Test Model",
  api: "cursor-acp" as const,
  provider: "cursor",
  baseUrl: "",
  reasoning: false,
  input: ["text" as const],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 0,
  maxTokens: 0,
};

// ---------------------------------------------------------------------------
// Helper factories for ACP SessionUpdate objects
// ---------------------------------------------------------------------------

function makeTextChunk(text: string) {
  return {
    sessionUpdate: "agent_message_chunk" as const,
    content: { type: "text" as const, text },
  };
}

function makeThinkingChunk(text: string) {
  return {
    sessionUpdate: "agent_thought_chunk" as const,
    content: { type: "text" as const, text },
  };
}

function makeToolCall(toolCallId: string, title: string) {
  return {
    sessionUpdate: "tool_call" as const,
    toolCallId,
    title,
    status: "pending" as const,
  };
}

function makeToolCallUpdate(toolCallId: string, status: "completed" | "failed" | "in_progress") {
  return {
    sessionUpdate: "tool_call_update" as const,
    toolCallId,
    status,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AcpEventTranslator", () => {
  let stream: MockStream;
  let translator: AcpEventTranslator;

  beforeEach(() => {
    stream = new MockStream();
    translator = new AcpEventTranslator(stream as any, mockModel as any, "session-123");
  });

  // =========================================================================
  // Constructor: start event
  // =========================================================================

  describe("constructor", () => {
    it("emits start event immediately on construction", () => {
      expect(stream.push).toHaveBeenCalledOnce();
      const event = stream.push.mock.calls[0][0];
      expect(event.type).toBe("start");
      expect(event.partial.role).toBe("assistant");
      expect(event.partial.model).toBe("test-model");
      expect(event.partial.content).toEqual([]);
    });
  });

  // =========================================================================
  // STRM-01: text flow (agent_message_chunk)
  // =========================================================================

  describe("STRM-01: agent_message_chunk → text events", () => {
    it("first agent_message_chunk pushes text_start event with contentIndex 0", () => {
      translator.handleUpdate(makeTextChunk("Hello") as any);

      const events = stream.push.mock.calls.map((c) => c[0]);
      const textStart = events.find((e) => e.type === "text_start");
      expect(textStart).toBeDefined();
      expect(textStart.contentIndex).toBe(0);
      expect(textStart.partial.content).toHaveLength(1);
      expect(textStart.partial.content[0].type).toBe("text");
    });

    it("second agent_message_chunk pushes text_delta event with same contentIndex", () => {
      translator.handleUpdate(makeTextChunk("Hello") as any);
      translator.handleUpdate(makeTextChunk(" world") as any);

      const events = stream.push.mock.calls.map((c) => c[0]);
      const textDeltas = events.filter((e) => e.type === "text_delta");
      expect(textDeltas).toHaveLength(2);
      expect(textDeltas[0].contentIndex).toBe(0);
      expect(textDeltas[0].delta).toBe("Hello");
      expect(textDeltas[1].contentIndex).toBe(0);
      expect(textDeltas[1].delta).toBe(" world");
    });

    it("handleDone() after text chunks pushes text_end then done event then ends stream", () => {
      translator.handleUpdate(makeTextChunk("Hello") as any);
      translator.handleUpdate(makeTextChunk(" world") as any);
      translator.handleDone({ stopReason: "end_turn" });

      const events = stream.push.mock.calls.map((c) => c[0]);
      const textEnd = events.find((e) => e.type === "text_end");
      const done = events.find((e) => e.type === "done");
      expect(textEnd).toBeDefined();
      expect(done).toBeDefined();
      // text_end comes before done
      const textEndIdx = events.indexOf(textEnd);
      const doneIdx = events.indexOf(done);
      expect(textEndIdx).toBeLessThan(doneIdx);
      expect(stream.end).toHaveBeenCalledOnce();
    });

    it("text_end content field accumulates full text from all deltas", () => {
      translator.handleUpdate(makeTextChunk("Hello") as any);
      translator.handleUpdate(makeTextChunk(" world") as any);
      translator.handleDone({ stopReason: "end_turn" });

      const events = stream.push.mock.calls.map((c) => c[0]);
      const textEnd = events.find((e) => e.type === "text_end");
      expect(textEnd.content).toBe("Hello world");
    });
  });

  // =========================================================================
  // STRM-03: thinking flow (agent_thought_chunk)
  // =========================================================================

  describe("STRM-03: agent_thought_chunk → thinking events", () => {
    it("first agent_thought_chunk pushes thinking_start on contentIndex 0", () => {
      translator.handleUpdate(makeThinkingChunk("Let me think") as any);

      const events = stream.push.mock.calls.map((c) => c[0]);
      const thinkingStart = events.find((e) => e.type === "thinking_start");
      expect(thinkingStart).toBeDefined();
      expect(thinkingStart.contentIndex).toBe(0);
    });

    it("second agent_thought_chunk pushes thinking_delta with same contentIndex", () => {
      translator.handleUpdate(makeThinkingChunk("Let me think") as any);
      translator.handleUpdate(makeThinkingChunk(" more") as any);

      const events = stream.push.mock.calls.map((c) => c[0]);
      const deltas = events.filter((e) => e.type === "thinking_delta");
      expect(deltas).toHaveLength(2);
      expect(deltas[1].contentIndex).toBe(0);
      expect(deltas[1].delta).toBe(" more");
    });

    it("block transition: thinking → text emits thinking_end before text_start on new contentIndex", () => {
      translator.handleUpdate(makeThinkingChunk("thinking") as any);
      translator.handleUpdate(makeTextChunk("answer") as any);

      const events = stream.push.mock.calls.map((c) => c[0]);
      const thinkingEnd = events.find((e) => e.type === "thinking_end");
      const textStart = events.find((e) => e.type === "text_start");
      expect(thinkingEnd).toBeDefined();
      expect(textStart).toBeDefined();
      expect(thinkingEnd.contentIndex).toBe(0);
      expect(textStart.contentIndex).toBe(1);
      // thinking_end before text_start
      expect(events.indexOf(thinkingEnd)).toBeLessThan(events.indexOf(textStart));
    });
  });

  // =========================================================================
  // STRM-02: tool call flow (tool_call / tool_call_update)
  // =========================================================================

  describe("STRM-02: tool_call / tool_call_update → toolcall events", () => {
    it("tool_call notification pushes toolcall_start event", () => {
      translator.handleUpdate(makeToolCall("tc-1", "read_file") as any);

      const events = stream.push.mock.calls.map((c) => c[0]);
      const toolcallStart = events.find((e) => e.type === "toolcall_start");
      expect(toolcallStart).toBeDefined();
      expect(toolcallStart.contentIndex).toBe(0);
    });

    it("tool_call_update with status completed pushes toolcall_end event", () => {
      translator.handleUpdate(makeToolCall("tc-1", "read_file") as any);
      translator.handleUpdate(makeToolCallUpdate("tc-1", "completed") as any);

      const events = stream.push.mock.calls.map((c) => c[0]);
      const toolcallEnd = events.find((e) => e.type === "toolcall_end");
      expect(toolcallEnd).toBeDefined();
    });

    it("toolcall_end ToolCall has type: toolCall, correct id, name, and arguments: {}", () => {
      translator.handleUpdate(makeToolCall("tc-1", "read_file") as any);
      translator.handleUpdate(makeToolCallUpdate("tc-1", "completed") as any);

      const events = stream.push.mock.calls.map((c) => c[0]);
      const toolcallEnd = events.find((e) => e.type === "toolcall_end");
      expect(toolcallEnd.toolCall.type).toBe("toolCall");
      expect(toolcallEnd.toolCall.id).toBe("tc-1");
      expect(toolcallEnd.toolCall.name).toBe("read_file");
      expect(toolcallEnd.toolCall.arguments).toEqual({});
    });
  });

  // =========================================================================
  // Abort
  // =========================================================================

  describe("handleAbort()", () => {
    it("handleAbort() pushes error event with reason: aborted and ends stream", () => {
      translator.handleAbort();

      const events = stream.push.mock.calls.map((c) => c[0]);
      const errorEvent = events.find((e) => e.type === "error");
      expect(errorEvent).toBeDefined();
      expect(errorEvent.reason).toBe("aborted");
      expect(stream.end).toHaveBeenCalledOnce();
    });

    it("handleAbort() after handleDone() is a no-op (isDone guard)", () => {
      translator.handleDone({ stopReason: "end_turn" });
      const callCountAfterDone = stream.push.mock.calls.length;

      translator.handleAbort();
      // No additional push calls
      expect(stream.push.mock.calls.length).toBe(callCountAfterDone);
      // end was only called once (for handleDone)
      expect(stream.end).toHaveBeenCalledOnce();
    });
  });

  // =========================================================================
  // Ignored notifications
  // =========================================================================

  describe("ignored notifications", () => {
    it("user_message_chunk notifications are ignored (no extra events pushed beyond start)", () => {
      const callCountAfterConstruct = stream.push.mock.calls.length;
      translator.handleUpdate({
        sessionUpdate: "user_message_chunk",
        content: { type: "text", text: "user message" },
      } as any);
      expect(stream.push.mock.calls.length).toBe(callCountAfterConstruct);
    });

    it("plan notifications are ignored (no extra events pushed beyond start)", () => {
      const callCountAfterConstruct = stream.push.mock.calls.length;
      translator.handleUpdate({
        sessionUpdate: "plan",
        entries: [],
      } as any);
      expect(stream.push.mock.calls.length).toBe(callCountAfterConstruct);
    });
  });
});
