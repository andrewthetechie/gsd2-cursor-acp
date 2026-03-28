# Phase 3: Provider & Streaming - Research

**Researched:** 2026-03-28
**Domain:** GSD-2 ApiProvider implementation + ACP session/update event translation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Context → ACP Mapping**
- D-10: Send only the latest user message in `session/prompt`. ACP sessions maintain their own conversation history — sending the full GSD-2 `Context.messages` history would double-count prior turns.
- D-11: `systemPrompt` is prepended as the first `ContentBlock` on the very first `session/prompt` call to a new session only. Subsequent calls to the same session omit it (the ACP session already has the context).
- D-12: `ToolResultMessage` entries in `context.messages` are skipped entirely. ACP sessions handle tool calls internally — GSD-2 tool results are from a different execution model and do not map to ACP prompts.

**CWD Sourcing**
- D-13: Use `process.cwd()` at call time to source the working directory for `getOrCreateSession(cwd)`. No custom options field needed.

**Session Mode**
- D-14: Explicitly pass `mode: 'agent'` to `session/new`. Required for STRM-02 (tool call events) and STRM-03 (thinking content).
- D-15: Update `AcpSessionPool` to accept a `sessionMode` option (type: `'agent' | 'plan' | 'ask'`, default: `'agent'`), and pass it in the `session/new` request.

**ThinkingLevel Handling**
- D-16: `streamSimple()` accepts `options.reasoning?: ThinkingLevel` but does not act on it in Phase 3. The field is silently ignored. No warning emitted.

### Claude's Discretion

- EventTranslator internal design: how `session/update` notification params map to specific `AssistantMessageEvent` types (`agent_message_chunk` → text events, `agent_thought_chunk` → thinking events, tool call updates → toolcall events)
- Partial `AssistantMessage` state management during streaming (building up the message incrementally for each event's `partial` field)
- How to detect and handle the `done` / stream-end signal from ACP (whether via `session/prompt` response or notification sequence)
- Whether to implement EventTranslator as pure functions, a class, or a generator
- Usage tracking / `Usage` object population (likely zeros for Phase 3, Phase 4 can refine with model metadata)
- AbortSignal integration: which ACP method to call (`session/cancel`) and how to wire signal → cancel → stream.end()

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROV-01 | Provider implements `ApiProvider` interface with `stream()` and `streamSimple()` methods | ApiProvider interface fully documented — `{ api, stream, streamSimple }` shape verified in api-registry.ts |
| PROV-02 | Provider returns `AssistantMessageEventStream` synchronously, populates asynchronously | Sync return + async IIFE pattern confirmed in Anthropic provider reference |
| PROV-03 | Provider registers as `"cursor-acp"` API type via `registerApiProvider()` | `registerApiProvider()` call pattern confirmed; standalone `register-cursor.ts` approach identified |
| STRM-01 | Provider maps ACP `session/update` notifications to `AssistantMessageEventStream` events | ACP notification params shape fully documented; event mapping table derived |
| STRM-02 | Provider maps tool call updates to toolcall_start/toolcall_end events | Tool call update types identified in ACP protocol reference material |
| STRM-03 | Provider extracts thinking/reasoning content to thinking_start/thinking_delta/thinking_end events | `agent_thought_chunk` notification type confirmed; thinking event sequence defined |
| STRM-04 | Provider supports cancellation via AbortSignal, sending `session/cancel` to ACP | `session/cancel` method exists in ACP; AbortSignal wiring pattern identified |
</phase_requirements>

---

## Summary

Phase 3 bridges two well-defined systems: GSD-2's push-based `AssistantMessageEventStream` and ACP's `session/update` notification stream. The core work is three things: (1) building `CursorAcpProvider` with the exact shape GSD-2 expects, (2) implementing an EventTranslator that converts ACP notification params into typed `AssistantMessageEvent` objects, and (3) wiring AbortSignal to `session/cancel`.

The Anthropic provider in GSD-2 is the canonical reference for the correct provider shape: a function that creates `new AssistantMessageEventStream()`, fires an async IIFE to populate it, and returns the stream synchronously. This pattern is well-verified. The ACP side is also clear — `session/update` notifications arrive on `transport.on('notification', ...)`, carrying a `params.update` object whose `sessionUpdate` discriminant (`'agent_message_chunk'`, `'agent_thought_chunk'`, tool call types) determines which GSD-2 event type to emit.

The main design question left to Claude's discretion is EventTranslator architecture. Research favors a stateful class (not a generator or pure functions) because it needs to maintain incremental `AssistantMessage` state for each event's `partial` field, track per-block `contentIndex` counters, and handle the stream-end signal cleanly. The `session/prompt` response (received after all notifications complete) carries `stopReason` and signals that `stream.end()` should be called.

**Primary recommendation:** Implement `CursorAcpProvider` as a module-level object literal satisfying `ApiProvider<'cursor-acp'>`. Use a class `AcpEventTranslator` for stateful notification-to-event conversion. Register via a standalone `registerCursorAcpProvider()` export in `src/register.ts`.

---

## Standard Stack

### Core (all already in project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `AssistantMessageEventStream` | (GSD-2 peer dep) | Push-based async iterable stream | Required by ApiProvider interface; `.push()` / `.end()` API is the only way in |
| `AcpSessionPool` | (Phase 2 output) | Session lifecycle + transport management | Phase 3 consumes this; D-13/D-14/D-15 require `getOrCreateSession(cwd)` call |
| `AcpTransport` | (Phase 1 output) | `notification` event source | EventTranslator listens to `transport.on('notification', ...)` |
| `registerApiProvider` | (GSD-2 peer dep) | Provider registration | PROV-03 requires `registerApiProvider({ api: 'cursor-acp', stream, streamSimple })` |

### No New Dependencies Required

Phase 3 adds zero npm dependencies. All required primitives (`EventEmitter`, `AssistantMessageEventStream`, `AcpSessionPool`, `AcpTransport`) are already present.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── transport.ts          # Phase 1 - no changes
├── session-pool.ts       # Phase 2 - add sessionMode option (D-15)
├── permission-handler.ts # Phase 2 - no changes
├── errors.ts             # Phase 1 - no changes
├── types.ts              # Phase 1 - no changes
├── provider.ts           # NEW: CursorAcpProvider + stream()/streamSimple()
├── event-translator.ts   # NEW: AcpEventTranslator class
├── register.ts           # NEW: registerCursorAcpProvider() export
└── index.ts              # Updated: export provider, register
```

### Pattern 1: Sync Return + Async IIFE (PROV-02, critical)

Every GSD-2 provider returns `AssistantMessageEventStream` synchronously. Population happens asynchronously inside an immediately-invoked async function that pushes events to the stream. This is the only pattern accepted by the GSD-2 consumer.

```typescript
// Source: context/gsd-2/packages/pi-ai/src/providers/anthropic.ts lines 145-183
export const streamCursorAcp: StreamFunction<'cursor-acp'> = (
  model,
  context,
  options,
): AssistantMessageEventStream => {
  const stream = new AssistantMessageEventStream();

  (async () => {
    try {
      const sessionId = await sessionPool.getOrCreateSession(process.cwd());
      const translator = new AcpEventTranslator(stream, model);

      // Wire up notification listener BEFORE sending prompt
      const onNotification = (notif: JsonRpcNotification) => {
        if (notif.method === 'session/update') {
          translator.handleUpdate(notif.params as SessionUpdateParams);
        }
      };
      transport.on('notification', onNotification);

      // Wire AbortSignal (STRM-04)
      options?.signal?.addEventListener('abort', () => {
        transport.sendRequest('session/cancel', { sessionId }).catch(() => {});
        translator.handleAbort();
      });

      // Send the prompt
      const result = await transport.sendRequest('session/prompt', {
        sessionId,
        prompt: buildPrompt(context),
      });

      transport.off('notification', onNotification);
      translator.handleDone(result as PromptResponse);
    } catch (err) {
      const errorMsg = buildErrorMessage(model, err);
      stream.push({ type: 'error', reason: 'error', error: errorMsg });
      stream.end(errorMsg);
    }
  })();

  return stream; // synchronous return
};
```

**Key detail:** The notification listener MUST be attached before `sendRequest('session/prompt')` is called. If attached after, early notifications can be missed (race condition).

### Pattern 2: AcpEventTranslator State Machine

The EventTranslator maintains:
- `partial: AssistantMessage` — the incremental message, updated on every event
- `contentIndex: number` — incremented each time a new content block starts
- `activeBlockType: 'text' | 'thinking' | 'toolcall' | null` — tracks which block is open

```typescript
// Source: derived from ACP notification shapes in cursor_acp.md + prompt.ts reference
class AcpEventTranslator {
  private partial: AssistantMessage;
  private contentIndex = -1;
  private activeBlockType: 'text' | 'thinking' | 'toolcall' | null = null;

  handleUpdate(params: { sessionId: string; update: SessionUpdate }): void {
    const { update } = params;
    switch (update.sessionUpdate) {
      case 'agent_message_chunk':
        this.handleTextChunk(update.content.text ?? '');
        break;
      case 'agent_thought_chunk':
        this.handleThinkingChunk(update.content.text ?? '');
        break;
      // tool call types: to be mapped per ACP spec
    }
  }

  handleDone(result: PromptResponse): void {
    // Close any open block
    this.closeActiveBlock();
    // Push 'done' event
    const stopReason = mapStopReason(result.stopReason);
    const message = this.buildFinalMessage(stopReason);
    this.stream.push({ type: 'done', reason: stopReason, message });
    this.stream.end(message);
  }

  handleAbort(): void {
    this.closeActiveBlock();
    const message = this.buildFinalMessage('aborted');
    this.stream.push({ type: 'error', reason: 'aborted', error: message });
    this.stream.end(message);
  }
}
```

### Pattern 3: ACP Notification → GSD-2 Event Mapping

**Verified from cursor_acp.md and prompt.ts reference:**

| ACP `sessionUpdate` value | GSD-2 events emitted | Notes |
|--------------------------|----------------------|-------|
| `agent_message_chunk` | `text_start` (if new block), `text_delta`, [no `text_end` until block closes] | Text accumulates in `partial.content[contentIndex]` |
| `agent_thought_chunk` | `thinking_start` (if new block), `thinking_delta` | Thinking accumulates in `partial.content[contentIndex]` |
| `user_message_chunk` | Ignored | Echo of user input; not part of AssistantMessage |
| `plan` | Ignored in Phase 3 | Future: could map to progress |
| [tool call type] | `toolcall_start`, `toolcall_delta`, `toolcall_end` | Tool call updates carry tool name + args |
| [stream end signal] | `text_end` / `thinking_end`, then `done` | Via `session/prompt` response, not a notification |

**Block boundary detection:**
- A `text_start` event is emitted when `agent_message_chunk` arrives and `activeBlockType !== 'text'`.
- A `thinking_start` event is emitted when `agent_thought_chunk` arrives and `activeBlockType !== 'thinking'`.
- When block type changes (e.g., thinking → text), the previous block must be closed with `text_end` or `thinking_end` before the new block opens.
- Final `text_end` / `thinking_end` events are emitted in `handleDone()` when closing the last open block.

### Pattern 4: Context → ACP Prompt Building

Per D-10, D-11, D-12:

```typescript
function buildPrompt(context: Context): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // D-11: system prompt on first call only (caller tracks isFirstCall)
  // This is managed by AcpSessionPool — session is new if just created
  if (isNewSession && context.systemPrompt) {
    blocks.push({ type: 'text', text: context.systemPrompt });
  }

  // D-10: Find the last user message only
  // D-12: Skip ToolResultMessage entries entirely
  const lastUserMessage = [...context.messages]
    .reverse()
    .find((m): m is UserMessage => m.role === 'user');

  if (lastUserMessage) {
    const text = typeof lastUserMessage.content === 'string'
      ? lastUserMessage.content
      : lastUserMessage.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('');
    blocks.push({ type: 'text', text });
  }

  return blocks;
}
```

**D-11 implementation detail:** `AcpSessionPool.getOrCreateSession()` already distinguishes new vs. reused sessions (it returns a new sessionId on creation, reuses on cache hit). Phase 3 can detect "new session" by checking whether the sessionId was just created. Options:
- Pass a `isNew: boolean` return value from `getOrCreateSession()` (requires modifying session-pool.ts API)
- Track a Set of "sessions that have received a first prompt" in the provider (no session-pool change needed)

The second approach (provider-side tracking) is preferred — it avoids changing AcpSessionPool's public API.

### Pattern 5: Session Mode Injection (D-15)

`AcpSessionPool.doCreateSession()` currently calls `session/new` with `{ cwd, mcpServers: [] }`. D-15 requires adding `mode` to that call:

```typescript
// In AcpSessionPool options (session-pool.ts modification):
export interface AcpSessionPoolOptions {
  // ...existing...
  sessionMode?: 'agent' | 'plan' | 'ask'; // NEW, default: 'agent'
}

// In doCreateSession():
const result = await this.transport.sendRequest('session/new', {
  cwd,
  mcpServers: [],
  mode: this.sessionMode, // 'agent' by default per D-14
}) as { sessionId: string };
```

### Pattern 6: Usage Object Population (Phase 3 placeholder)

GSD-2's `AssistantMessage.usage` has a rigid shape. Phase 3 populates it with zeros:

```typescript
const zeroUsage: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};
```

Phase 4 will wire in actual token counts from model metadata.

### Pattern 7: Registration (PROV-03)

Since this is a standalone package (not inside GSD-2), it exports its own registration function rather than patching `register-builtins.ts`:

```typescript
// src/register.ts
import { registerApiProvider } from '@gsd/pi-ai';
import { streamCursorAcp, streamSimpleCursorAcp } from './provider.js';

export function registerCursorAcpProvider(): void {
  registerApiProvider({
    api: 'cursor-acp',
    stream: streamCursorAcp,
    streamSimple: streamSimpleCursorAcp,
  });
}
```

The consumer calls `registerCursorAcpProvider()` once at startup.

### Anti-Patterns to Avoid

- **Attaching notification listener AFTER `sendRequest('session/prompt')`:** ACP sends notifications as soon as the model starts generating. Race condition will drop early chunks.
- **Not closing open blocks before emitting `done`:** Consumers expect `text_end` before `done`. An open `text_start` without matching `text_end` breaks the event sequence contract.
- **Awaiting `session/prompt` from inside an `await` before attaching listener:** Same race condition as above. Listener must be attached synchronously before the `await`.
- **Sending full `context.messages` as prompt:** Violates D-10; will double-count conversation history maintained by ACP session.
- **Calling `stream.push()` or `stream.end()` after `stream.end()` is already called:** `AssistantMessageEventStream.push()` is a no-op after `done = true`, so it's safe — but `end()` called twice is also safe (idempotent pattern verified in event-stream.ts source).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Push-based async iterable stream | Custom EventEmitter + async iterator | `AssistantMessageEventStream` | Already handles backpressure, waiter queue, done state, final result promise |
| Session lifecycle | Custom session tracking | `AcpSessionPool.getOrCreateSession()` | Handles init mutex, per-cwd dedup, LRU eviction, restart recovery |
| JSON-RPC over stdio | Custom framing/parsing | `AcpTransport.sendRequest()` / `transport.on('notification')` | Handles line parsing, ID correlation, timeout, process crash restart |
| Permission handling | Custom allow/deny logic | `AcpSessionPool` + `PermissionHandler` | Already wired in Phase 2 |

---

## Common Pitfalls

### Pitfall 1: Notification Listener Race Condition
**What goes wrong:** First few `agent_message_chunk` notifications arrive before the listener is registered, leading to missing text at the start of the response.
**Why it happens:** `sendRequest('session/prompt')` triggers ACP to start streaming immediately. Any async operation between sending the request and attaching the listener creates a window.
**How to avoid:** Register `transport.on('notification', handler)` before calling `sendRequest('session/prompt')`. The sequence is: (1) get session, (2) attach listener, (3) send prompt.
**Warning signs:** Responses that seem truncated at the beginning, missing opening words/sentences.

### Pitfall 2: Leaked Notification Listener
**What goes wrong:** Notification handler remains registered after stream ends, causing events from a later prompt on the same session to bleed into a stale handler.
**Why it happens:** `transport.on('notification')` registers a persistent listener on the shared transport EventEmitter. If cleanup is forgotten, multiple listeners accumulate.
**How to avoid:** Always `transport.off('notification', onNotification)` in a `finally` block or after `handleDone()` / `handleAbort()`.
**Warning signs:** Receiving duplicate events, events appearing on wrong streams.

### Pitfall 3: Missing `text_end` Before `done`
**What goes wrong:** Consumers receive `text_start` + `text_delta` events but never `text_end`. The `done` event arrives with no prior close of the text block. Some consumers depend on `text_end` for rendering decisions.
**Why it happens:** `session/prompt` response signals stream end; if `handleDone()` doesn't close open blocks first, the close events are never emitted.
**How to avoid:** In `handleDone()`, call `closeActiveBlock()` before emitting `done`. `closeActiveBlock()` emits `text_end` or `thinking_end` based on `activeBlockType`.

### Pitfall 4: AbortSignal After Stream Already Done
**What goes wrong:** `session/cancel` is sent even after the session/prompt response has already resolved (e.g., user aborts right as the response completes). This can cause an error on an already-closed session.
**Why it happens:** AbortSignal listener fires independently of stream state.
**How to avoid:** Track `isDone` state in the translator. In the abort handler, no-op if `isDone === true`. Wrap `session/cancel` call in `.catch(() => {})` to swallow post-completion errors.

### Pitfall 5: `session/new` Without `mode` Field (D-14)
**What goes wrong:** Without `mode: 'agent'`, the ACP session may not return tool call updates or thinking content notifications, causing STRM-02 and STRM-03 to silently fail.
**Why it happens:** Current `doCreateSession()` in session-pool.ts does not pass `mode`. D-15 requires this to be added.
**How to avoid:** This is a session-pool.ts modification task. The planner MUST include a task to add `sessionMode` option and pass `mode` in `session/new`.

### Pitfall 6: Transport-Level vs. Session-Level Notifications
**What goes wrong:** The `notification` event on `AcpTransport` fires for ALL notifications from the ACP process, not just the current session's updates. If multiple sessions are active, handlers for session A can receive session B's notifications.
**Why it happens:** `AcpTransport` is a single shared EventEmitter.
**How to avoid:** In the notification handler, filter by `params.sessionId` before processing. Only handle notifications whose `sessionId` matches the current prompt's session.

---

## Code Examples

### Full Provider Stream Function Shape

```typescript
// Source: derived from context/gsd-2/packages/pi-ai/src/providers/anthropic.ts pattern
// and ACP protocol from context/cursor_acp.md
export const streamCursorAcp: StreamFunction<'cursor-acp'> = (
  model,
  context,
  options,
): AssistantMessageEventStream => {
  const stream = new AssistantMessageEventStream();

  (async () => {
    let onNotification: ((n: JsonRpcNotification) => void) | null = null;
    try {
      const sessionId = await sessionPool.getOrCreateSession(process.cwd());
      const isNew = sessionTracker.markIfNew(sessionId); // provider-side tracking
      const translator = new AcpEventTranslator(stream, model, sessionId);

      onNotification = (notif: JsonRpcNotification) => {
        if (notif.method === 'session/update') {
          const params = notif.params as { sessionId: string; update: SessionUpdate };
          if (params.sessionId === sessionId) { // Pitfall 6: filter by sessionId
            translator.handleUpdate(params.update);
          }
        }
      };

      // Attach BEFORE send (Pitfall 1)
      sessionPool.transport.on('notification', onNotification);

      // Wire abort (STRM-04)
      let aborted = false;
      options?.signal?.addEventListener('abort', () => {
        if (!aborted) {
          aborted = true;
          sessionPool.transport.sendRequest('session/cancel', { sessionId })
            .catch(() => {}); // Pitfall 4: swallow post-completion errors
          translator.handleAbort();
        }
      });

      const result = await sessionPool.transport.sendRequest('session/prompt', {
        sessionId,
        prompt: buildPrompt(context, isNew),
      });

      if (!aborted) {
        translator.handleDone(result as { stopReason: string });
      }
    } catch (err) {
      const errMsg = buildErrorMessage(model, err);
      stream.push({ type: 'error', reason: 'error', error: errMsg });
      stream.end(errMsg);
    } finally {
      if (onNotification) {
        sessionPool.transport.off('notification', onNotification); // Pitfall 2: cleanup
      }
    }
  })();

  return stream;
};
```

### AssistantMessage Partial Builder

```typescript
// Source: context/gsd-2/packages/pi-ai/src/types.ts — AssistantMessage shape
function buildInitialPartial(model: Model<'cursor-acp'>): AssistantMessage {
  return {
    role: 'assistant',
    content: [],
    api: 'cursor-acp',
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  };
}
```

### ACP Stop Reason → GSD-2 StopReason Mapping

```typescript
// Source: ACP stop reasons from prompt.ts reference; GSD-2 StopReason from types.ts
function mapStopReason(acpReason: string): Extract<StopReason, 'stop' | 'length'> {
  switch (acpReason) {
    case 'end_turn': return 'stop';
    case 'max_tokens': return 'length';
    case 'max_turn_requests': return 'length';
    case 'cancelled': return 'stop'; // Abort handled separately via 'aborted'
    default: return 'stop';
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| ACP `session/new` without `mode` field | Must pass `mode: 'agent'` for tool + thinking notifications (D-14) | Without this, STRM-02/03 silently fail |
| Provider registered inside GSD-2 repo | Standalone package exports `registerCursorAcpProvider()` | Consumer calls once at startup; no GSD-2 fork needed |

---

## Open Questions

1. **ACP tool call notification shape**
   - What we know: ACP sends tool call updates via `session/update` notifications; `prompt.ts` reference shows tool call tracking with `status` field
   - What's unclear: The exact `sessionUpdate` discriminant values for tool call start/end in the real ACP protocol (the reference `prompt.ts` is a server-side adapter, not the client-facing notification shape)
   - Recommendation: Inspect real ACP output empirically OR rely on `@agentclientprotocol/sdk` type definitions for `SessionUpdate` union members. The `@agentclientprotocol/sdk` package is already a dependency — check its exported types for the exact union.

2. **`isNewSession` detection for D-11 (system prompt on first call only)**
   - What we know: `AcpSessionPool.getOrCreateSession()` returns the same sessionId for cache hits; a new sessionId means a new session
   - What's unclear: There is no explicit `isNew` return value from the current API
   - Recommendation: Maintain a `Set<string>` of "prompted session IDs" in the provider. A sessionId not in the set is new (first prompt); add it after sending the first prompt.

3. **`transport` access from provider**
   - What we know: `CursorAcpProvider` needs to attach/detach notification listeners on `AcpTransport`, but `AcpSessionPool` does not currently expose `transport` publicly
   - What's unclear: Whether to expose `transport` on `AcpSessionPool`, or inject it separately into the provider
   - Recommendation: Expose `transport` as a readonly public property on `AcpSessionPool` (minimal change). The provider receives `sessionPool` and accesses `sessionPool.transport`.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 3 is a pure code change. No new external dependencies are introduced. `cursor-agent` binary dependency is already handled by Phase 2's `AcpSessionPool` initialization.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | None (vitest defaults; `package.json` `"test": "vitest run"`) |
| Quick run command | `npm test -- --reporter=verbose` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROV-01 | `CursorAcpProvider` satisfies `ApiProvider` shape at compile time | TypeScript type check | `npm run typecheck` | ❌ Wave 0 |
| PROV-02 | `stream()` returns stream synchronously, not a Promise | unit | `npm test -- --reporter=verbose src/provider.test.ts` | ❌ Wave 0 |
| PROV-03 | `registerCursorAcpProvider()` registers `'cursor-acp'` in GSD-2 registry | unit | `npm test -- --reporter=verbose src/register.test.ts` | ❌ Wave 0 |
| STRM-01 | `agent_message_chunk` notifications become `text_delta` + `text_end` + `done` events | unit | `npm test -- --reporter=verbose src/event-translator.test.ts` | ❌ Wave 0 |
| STRM-02 | Tool call updates become `toolcall_start` + `toolcall_end` events | unit | `npm test -- --reporter=verbose src/event-translator.test.ts` | ❌ Wave 0 |
| STRM-03 | `agent_thought_chunk` notifications become `thinking_start` + `thinking_delta` + `thinking_end` events | unit | `npm test -- --reporter=verbose src/event-translator.test.ts` | ❌ Wave 0 |
| STRM-04 | AbortSignal causes `session/cancel` and stream ends with `error/aborted` | unit | `npm test -- --reporter=verbose src/provider.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run typecheck && npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/event-translator.test.ts` — covers STRM-01, STRM-02, STRM-03 (event mapping logic)
- [ ] `src/provider.test.ts` — covers PROV-02, STRM-04 (stream return, abort signal)
- [ ] `src/register.test.ts` — covers PROV-03 (provider registration)
- [ ] Test framework already installed (vitest 3.x) — no install step needed

---

## Sources

### Primary (HIGH confidence)
- `context/gsd-2/packages/pi-ai/src/utils/event-stream.ts` — `AssistantMessageEventStream` class: push/end API, isComplete/extractResult logic verified
- `context/gsd-2/packages/pi-ai/src/api-registry.ts` — `ApiProvider` interface, `registerApiProvider()` implementation verified
- `context/gsd-2/packages/pi-ai/src/types.ts` — All types: `AssistantMessageEvent`, `AssistantMessage`, `Context`, `ToolCall`, `Usage`, `StopReason` verified
- `context/gsd-2/packages/pi-ai/src/providers/anthropic.ts` — Canonical sync-return + async IIFE pattern verified (lines 145-183)
- `context/gsd-2/packages/pi-ai/src/providers/register-builtins.ts` — `registerApiProvider()` call pattern verified
- `context/cursor_acp.md` — ACP protocol: `session/update`, notification shape, `session/cancel`, modes verified
- `context/cursor-agent-acp-npm/src/protocol/prompt.ts` — `session/update` types: `agent_message_chunk`, `agent_thought_chunk`, session queue pattern verified
- `src/session-pool.ts` — `AcpSessionPool`: `getOrCreateSession()`, `doCreateSession()`, transport access verified
- `src/transport.ts` — `AcpTransport`: `notification` event, `sendRequest()`, EventEmitter pattern verified
- `src/errors.ts` — Error classes: `TransportError`, `JsonRpcError` available for error events

### Secondary (MEDIUM confidence)
- `context/cursor-agent-acp-npm/src/protocol/content.ts` — ContentBlock types, streaming state management patterns (from reference implementation)
- `src/session-pool.test.ts` — Existing test patterns: mock transport via EventEmitter, `vi.fn()`, import pattern verified

### Tertiary (LOW confidence)
- ACP tool call notification exact `sessionUpdate` discriminant values — not directly verified from authoritative source; recommend checking `@agentclientprotocol/sdk` exported types

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies already in project, APIs verified
- Architecture patterns: HIGH — Anthropic provider is canonical reference; ACP notification shapes verified in reference material
- Event mapping (STRM-01/02/03): MEDIUM-HIGH — text/thinking types verified; tool call discriminants need SDK type check
- Pitfalls: HIGH — race conditions and listener leaks are standard EventEmitter concerns, verified against transport.ts implementation
- D-15 session-pool modification: HIGH — clear, minimal change

**Research date:** 2026-03-28
**Valid until:** 2026-04-27 (stable protocol; ACP SDK version pinned at ^0.17.0)
