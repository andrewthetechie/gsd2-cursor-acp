/**
 * AcpEventTranslator: converts ACP session/update notifications to GSD-2 AssistantMessageEvents.
 *
 * Types are sourced from context/gsd-2/packages/pi-ai/src/types.ts and
 * context/gsd-2/packages/pi-ai/src/utils/event-stream.ts. When @gsd/pi-ai is
 * installed as a peer dependency these imports should be replaced with:
 *   import type { ... } from '@gsd/pi-ai';
 */

import type { SessionUpdate } from "@agentclientprotocol/sdk";

// ---------------------------------------------------------------------------
// Inline type definitions matching @gsd/pi-ai shapes exactly.
// Replace these with `import type { ... } from '@gsd/pi-ai'` once installed.
// ---------------------------------------------------------------------------

interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

type StopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

interface TextContent {
  type: "text";
  text: string;
}

interface ThinkingContent {
  type: "thinking";
  thinking: string;
}

interface GsdToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

type ContentItem = TextContent | ThinkingContent | GsdToolCall;

interface AssistantMessage {
  role: "assistant";
  content: ContentItem[];
  api: string;
  provider: string;
  model: string;
  usage: Usage;
  stopReason: StopReason;
  timestamp: number;
}

type AssistantMessageEvent =
  | { type: "start"; partial: AssistantMessage }
  | { type: "text_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "text_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "text_end"; contentIndex: number; content: string; partial: AssistantMessage }
  | { type: "thinking_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "thinking_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "thinking_end"; contentIndex: number; content: string; partial: AssistantMessage }
  | { type: "toolcall_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "toolcall_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "toolcall_end"; contentIndex: number; toolCall: GsdToolCall; partial: AssistantMessage; malformedArguments?: boolean }
  | { type: "done"; reason: "stop" | "length" | "toolUse"; message: AssistantMessage }
  | { type: "error"; reason: "aborted" | "error"; error: AssistantMessage };

interface AssistantMessageEventStream {
  push(event: AssistantMessageEvent): void;
  end(result?: AssistantMessage): void;
}

interface ModelLike {
  id: string;
  api: string;
  provider: string;
}

// ---------------------------------------------------------------------------
// AcpEventTranslator
// ---------------------------------------------------------------------------

/**
 * Converts ACP session/update notifications to GSD-2 AssistantMessageEvents.
 *
 * Usage:
 *   const translator = new AcpEventTranslator(stream, model, sessionId);
 *   // For each session/update notification:
 *   translator.handleUpdate(update);
 *   // When the session completes:
 *   translator.handleDone({ stopReason: 'end_turn' });
 *   // Or on abort:
 *   translator.handleAbort();
 */
export class AcpEventTranslator {
  private partial: AssistantMessage;
  private contentIndex = -1;
  private activeBlockType: "text" | "thinking" | "toolcall" | null = null;
  private isDone = false;
  /** Accumulated text for the current block (for text_end/thinking_end content field). */
  private blockText = "";
  /** Active tool call id for matching tool_call_update events. */
  private activeToolCallId: string | null = null;
  private activeToolCallName: string | null = null;

  constructor(
    private readonly stream: AssistantMessageEventStream,
    private readonly model: ModelLike,
    // sessionId is stored for provider-level filtering (used by the provider layer, not this translator)
    private readonly sessionId: string,
  ) {
    const zeroUsage: Usage = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };

    this.partial = {
      role: "assistant",
      content: [],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: zeroUsage,
      stopReason: "stop",
      timestamp: Date.now(),
    };

    // Emit start event immediately (per spec)
    this.stream.push({ type: "start", partial: this.partialSnapshot() });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Handle a single session/update notification from the ACP transport.
   * The `update` parameter is the `params.update` field from the notification.
   */
  handleUpdate(update: SessionUpdate): void {
    switch (update.sessionUpdate) {
      case "agent_message_chunk": {
        const block = update.content;
        const text = block && block.type === "text" ? block.text : "";
        this.handleTextChunk(text);
        break;
      }
      case "agent_thought_chunk": {
        const block = update.content;
        const text = block && block.type === "text" ? block.text : "";
        this.handleThinkingChunk(text);
        break;
      }
      case "tool_call":
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.handleToolCallStart(update as any);
        break;
      case "tool_call_update":
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.handleToolCallUpdate(update as any);
        break;
      // user_message_chunk, plan, available_commands_update, and all others: no-op
      default:
        break;
    }
  }

  /**
   * Call when the ACP session/prompt completes successfully.
   * Closes any open block, emits done event, and ends the stream.
   * Idempotent — subsequent calls are no-ops.
   */
  handleDone(result: { stopReason?: string }): void {
    if (this.isDone) return;
    this.isDone = true;

    this.closeActiveBlock();

    const mappedReason = this.mapStopReason(result.stopReason);
    this.partial.stopReason = mappedReason;

    const finalMessage = this.partialSnapshot();
    this.stream.push({
      type: "done",
      reason: mappedReason as "stop" | "length" | "toolUse",
      message: finalMessage,
    });
    this.stream.end(finalMessage);
  }

  /**
   * Call when the ACP session/prompt is aborted.
   * Closes any open block, emits error event, and ends the stream.
   * Idempotent — subsequent calls after handleDone() are no-ops.
   */
  handleAbort(): void {
    if (this.isDone) return;
    this.isDone = true;

    this.closeActiveBlock();

    const errorMessage: AssistantMessage = { ...this.partial, stopReason: "aborted" };
    this.stream.push({ type: "error", reason: "aborted", error: errorMessage });
    this.stream.end(errorMessage);
  }

  // ---------------------------------------------------------------------------
  // Private: block handlers
  // ---------------------------------------------------------------------------

  private handleTextChunk(text: string): void {
    if (this.activeBlockType !== "text") {
      this.closeActiveBlock();
      this.contentIndex++;
      this.activeBlockType = "text";
      this.blockText = "";
      this.activeToolCallId = null;
      this.activeToolCallName = null;

      // Push initial TextContent to partial.content
      const textContent: TextContent = { type: "text", text: "" };
      this.partial.content.push(textContent);

      this.stream.push({
        type: "text_start",
        contentIndex: this.contentIndex,
        partial: this.partialSnapshot(),
      });
    }

    // Accumulate text
    this.blockText += text;
    (this.partial.content[this.contentIndex] as TextContent).text = this.blockText;

    this.stream.push({
      type: "text_delta",
      contentIndex: this.contentIndex,
      delta: text,
      partial: this.partialSnapshot(),
    });
  }

  private handleThinkingChunk(text: string): void {
    if (this.activeBlockType !== "thinking") {
      this.closeActiveBlock();
      this.contentIndex++;
      this.activeBlockType = "thinking";
      this.blockText = "";
      this.activeToolCallId = null;
      this.activeToolCallName = null;

      const thinkingContent: ThinkingContent = { type: "thinking", thinking: "" };
      this.partial.content.push(thinkingContent);

      this.stream.push({
        type: "thinking_start",
        contentIndex: this.contentIndex,
        partial: this.partialSnapshot(),
      });
    }

    this.blockText += text;
    (this.partial.content[this.contentIndex] as ThinkingContent).thinking = this.blockText;

    this.stream.push({
      type: "thinking_delta",
      contentIndex: this.contentIndex,
      delta: text,
      partial: this.partialSnapshot(),
    });
  }

  private handleToolCallStart(toolCall: { toolCallId: string; title: string; status?: string }): void {
    this.closeActiveBlock();
    this.contentIndex++;
    this.activeBlockType = "toolcall";
    this.blockText = "";
    this.activeToolCallId = toolCall.toolCallId;
    this.activeToolCallName = toolCall.title;

    const gsdToolCall: GsdToolCall = {
      type: "toolCall",
      id: toolCall.toolCallId,
      name: toolCall.title,
      arguments: {},
    };
    this.partial.content.push(gsdToolCall);

    this.stream.push({
      type: "toolcall_start",
      contentIndex: this.contentIndex,
      partial: this.partialSnapshot(),
    });
  }

  private handleToolCallUpdate(update: { toolCallId: string; status?: string | null }): void {
    if (update.status === "completed" || update.status === "failed") {
      // Find the tool call in partial.content by id
      const foundToolCall = this.partial.content.find(
        (c): c is GsdToolCall => c.type === "toolCall" && c.id === update.toolCallId,
      );

      if (foundToolCall) {
        this.stream.push({
          type: "toolcall_end",
          contentIndex: this.contentIndex,
          toolCall: foundToolCall,
          partial: this.partialSnapshot(),
        });
      }

      // Tool call block is closed
      if (this.activeToolCallId === update.toolCallId) {
        this.activeBlockType = null;
        this.activeToolCallId = null;
        this.activeToolCallName = null;
      }
    }
    // Otherwise: intermediate updates (pending, in_progress) are not translated in Phase 3
  }

  // ---------------------------------------------------------------------------
  // Private: block lifecycle
  // ---------------------------------------------------------------------------

  private closeActiveBlock(): void {
    switch (this.activeBlockType) {
      case "text":
        this.stream.push({
          type: "text_end",
          contentIndex: this.contentIndex,
          content: this.blockText,
          partial: this.partialSnapshot(),
        });
        this.activeBlockType = null;
        break;

      case "thinking":
        this.stream.push({
          type: "thinking_end",
          contentIndex: this.contentIndex,
          content: this.blockText,
          partial: this.partialSnapshot(),
        });
        this.activeBlockType = null;
        break;

      case "toolcall": {
        // Find partial tool call and close it
        const toolCall = this.partial.content.find(
          (c): c is GsdToolCall => c.type === "toolCall" && c.id === (this.activeToolCallId ?? ""),
        );
        if (toolCall) {
          this.stream.push({
            type: "toolcall_end",
            contentIndex: this.contentIndex,
            toolCall,
            partial: this.partialSnapshot(),
          });
        }
        this.activeBlockType = null;
        this.activeToolCallId = null;
        this.activeToolCallName = null;
        break;
      }

      case null:
        // No active block — no-op
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Private: utilities
  // ---------------------------------------------------------------------------

  private mapStopReason(acpReason?: string): "stop" | "length" | "toolUse" {
    switch (acpReason) {
      case "end_turn":
        return "stop";
      case "max_tokens":
        return "length";
      case "max_turn_requests":
        return "length";
      case "cancelled":
        return "stop";
      default:
        return "stop";
    }
  }

  private partialSnapshot(): AssistantMessage {
    return { ...this.partial, content: [...this.partial.content] };
  }
}
