/**
 * CursorAcpProvider: implements ApiProvider<'cursor-acp'> for GSD-2.
 *
 * Types are sourced from context/gsd-2/packages/pi-ai/src/types.ts and
 * context/gsd-2/packages/pi-ai/src/api-registry.ts. When @gsd/pi-ai is
 * installed as a peer dependency these imports should be replaced with:
 *   import type { ... } from '@gsd/pi-ai';
 *   import { AssistantMessageEventStream } from '@gsd/pi-ai';
 */

import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type { JsonRpcNotification } from "./types.js";
import { AcpSessionPool, type AcpSessionPoolOptions } from "./session-pool.js";
import { AcpEventTranslator } from "./event-translator.js";

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

interface ImageContent {
  type: "image";
  url: string;
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
  errorMessage?: string;
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

// Minimal EventStream implementation matching context/gsd-2/packages/pi-ai/src/utils/event-stream.ts
class EventStream<T, R = T> implements AsyncIterable<T> {
  private queue: T[] = [];
  private waiting: ((value: IteratorResult<T>) => void)[] = [];
  private done = false;
  private finalResultPromise: Promise<R>;
  private resolveFinalResult!: (result: R) => void;

  constructor(
    private isComplete: (event: T) => boolean,
    private extractResult: (event: T) => R,
  ) {
    this.finalResultPromise = new Promise((resolve) => {
      this.resolveFinalResult = resolve;
    });
  }

  push(event: T): void {
    if (this.done) return;
    if (this.isComplete(event)) {
      this.done = true;
      this.resolveFinalResult(this.extractResult(event));
    }
    const waiter = this.waiting.shift();
    if (waiter) {
      waiter({ value: event, done: false });
    } else {
      this.queue.push(event);
    }
  }

  end(result?: R): void {
    this.done = true;
    if (result !== undefined) {
      this.resolveFinalResult(result);
    }
    while (this.waiting.length > 0) {
      const waiter = this.waiting.shift()!;
      waiter({ value: undefined as unknown as T, done: true });
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!;
      } else if (this.done) {
        return;
      } else {
        const result = await new Promise<IteratorResult<T>>((resolve) => this.waiting.push(resolve));
        if (result.done) return;
        yield result.value;
      }
    }
  }

  result(): Promise<R> {
    return this.finalResultPromise;
  }
}

export class AssistantMessageEventStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
  constructor() {
    super(
      (event) => event.type === "done" || event.type === "error",
      (event) => {
        if (event.type === "done") return event.message;
        if (event.type === "error") return event.error;
        throw new Error("Unexpected event type for final result");
      },
    );
  }
}

interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
}

interface AssistantMsg {
  role: "assistant";
  content: ContentItem[];
  timestamp: number;
}

interface ToolResultMessage {
  role: "toolResult";
  // D-12: skip entirely
  [key: string]: unknown;
}

type Message = UserMessage | AssistantMsg | ToolResultMessage;

interface Context {
  systemPrompt?: string;
  messages: Message[];
  tools?: unknown[];
}

interface Model {
  id: string;
  name: string;
  api: "cursor-acp";
  provider: string;
  baseUrl: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
}

type StreamFunction = (model: Model, context: Context, options?: StreamOptions) => AssistantMessageEventStream;
type StreamSimpleFunction = (model: Model, context: Context, options?: SimpleStreamOptions) => AssistantMessageEventStream;

interface StreamOptions {
  signal?: AbortSignal;
  [key: string]: unknown;
}

interface SimpleStreamOptions extends StreamOptions {
  reasoning?: string;
  thinkingBudgets?: unknown;
}

// ---------------------------------------------------------------------------
// Module-level singleton pool
// ---------------------------------------------------------------------------

let _pool: AcpSessionPool | null = null;

function getPool(): AcpSessionPool {
  if (!_pool) {
    _pool = new AcpSessionPool({ sessionMode: 'agent' } as AcpSessionPoolOptions);
  }
  return _pool;
}

// Provider-side tracking for D-11: track which sessions have received their first prompt.
const promptedSessions = new Set<string>();

// Build the prompt content blocks for session/prompt per D-10, D-11, D-12.
function buildPrompt(
  context: Context,
  sessionId: string,
): Array<{ type: 'text'; text: string }> {
  const blocks: Array<{ type: 'text'; text: string }> = [];

  // D-11: System prompt only on first call to a new session
  const isNew = !promptedSessions.has(sessionId);
  if (isNew && context.systemPrompt) {
    blocks.push({ type: 'text', text: context.systemPrompt });
  }
  promptedSessions.add(sessionId);

  // D-10: Send only the last user message.
  // D-12: Skip ToolResultMessage entries entirely.
  const lastUserMessage = [...context.messages]
    .reverse()
    .find((m): m is UserMessage => m.role === 'user');

  if (lastUserMessage) {
    const text =
      typeof lastUserMessage.content === 'string'
        ? lastUserMessage.content
        : lastUserMessage.content
            .filter((c) => c.type === 'text')
            .map((c) => (c as TextContent).text)
            .join('');
    if (text) {
      blocks.push({ type: 'text', text });
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Stream function
// ---------------------------------------------------------------------------

export const streamCursorAcp: StreamFunction = (
  model,
  context,
  options,
): AssistantMessageEventStream => {
  const stream = new AssistantMessageEventStream();

  (async () => {
    const pool = getPool();
    let onNotification: ((notif: JsonRpcNotification) => void) | null = null;
    let isDone = false;

    try {
      const sessionId = await pool.getOrCreateSession(process.cwd());
      // AcpEventTranslator accepts any object with push/end matching AssistantMessageEventStream.
      // The stream and model shapes are structurally compatible with the translator's inline types.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const translator = new AcpEventTranslator(stream as any, model as any, sessionId);

      // Pitfall 1: Attach listener BEFORE sending prompt.
      onNotification = (notif: JsonRpcNotification) => {
        if (notif.method === 'session/update') {
          const params = notif.params as { sessionId: string; update: SessionUpdate };
          // Pitfall 6: filter by sessionId to avoid cross-session bleed.
          if (params.sessionId === sessionId) {
            translator.handleUpdate(params.update);
          }
        }
      };
      pool.transport.on('notification', onNotification);

      // STRM-04: Wire AbortSignal to session/cancel.
      options?.signal?.addEventListener('abort', () => {
        if (!isDone) {
          isDone = true;
          pool.transport
            .sendRequest('session/cancel', { sessionId })
            .catch(() => {}); // Pitfall 4: swallow post-completion errors
          translator.handleAbort();
        }
      });

      const prompt = buildPrompt(context, sessionId);
      const result = await pool.transport.sendRequest('session/prompt', {
        sessionId,
        prompt,
      });

      if (!isDone) {
        isDone = true;
        translator.handleDone(result as { stopReason?: string });
      }
    } catch (err) {
      if (!isDone) {
        isDone = true;
        const errMsg = err instanceof Error ? err.message : String(err);
        const errorMessage: AssistantMessage = {
          role: 'assistant' as const,
          content: [],
          api: 'cursor-acp',
          provider: model.provider,
          model: model.id,
          usage: {
            input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'error' as const,
          errorMessage: errMsg,
          timestamp: Date.now(),
        };
        stream.push({ type: 'error', reason: 'error', error: errorMessage });
        stream.end(errorMessage);
      }
    } finally {
      // Pitfall 2: Always remove the notification listener.
      if (onNotification) {
        pool.transport.off('notification', onNotification);
      }
    }
  })();

  return stream; // synchronous return per PROV-02
};

// D-16: streamSimple accepts reasoning option but silently ignores it in Phase 3.
export const streamSimpleCursorAcp: StreamSimpleFunction = (
  model,
  context,
  options,
): AssistantMessageEventStream => {
  // Pass through to streamCursorAcp — reasoning field silently ignored.
  return streamCursorAcp(model, context, options);
};

export const cursorAcpProvider = {
  api: 'cursor-acp' as const,
  stream: streamCursorAcp,
  streamSimple: streamSimpleCursorAcp,
};

// For testing: allows injecting a custom pool instance.
export function _setPoolForTest(pool: AcpSessionPool | null): void {
  _pool = pool;
}
