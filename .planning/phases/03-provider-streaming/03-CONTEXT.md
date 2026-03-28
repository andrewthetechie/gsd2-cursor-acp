# Phase 3: Provider & Streaming - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

CursorAcpProvider implementing GSD-2's ApiProvider interface. `stream()` and `streamSimple()` call ACP `session/prompt` and listen for `session/update` notifications, translating them into a correctly-typed `AssistantMessageEventStream`. Builds on Phase 2's `AcpSessionPool` for session management. Does NOT include model discovery (Phase 4) or error hardening (Phase 5).

</domain>

<decisions>
## Implementation Decisions

### Context → ACP Mapping
- **D-10:** Send only the latest user message in `session/prompt`. ACP sessions maintain their own conversation history — sending the full GSD-2 `Context.messages` history would double-count prior turns.
- **D-11:** `systemPrompt` is prepended as the first `ContentBlock` on the very first `session/prompt` call to a new session only. Subsequent calls to the same session omit it (the ACP session already has the context).
- **D-12:** `ToolResultMessage` entries in `context.messages` are skipped entirely. ACP sessions handle tool calls internally — GSD-2 tool results are from a different execution model and do not map to ACP prompts.

### CWD Sourcing
- **D-13:** Use `process.cwd()` at call time to source the working directory for `getOrCreateSession(cwd)`. This is correct for CLI/subagent use cases where cwd is set by the caller before invoking the provider. No custom options field needed.

### Session Mode
- **D-14:** Explicitly pass `mode: 'agent'` to `session/new`. This is required for STRM-02 (tool call events) and STRM-03 (thinking content) — `agent` mode enables full tool access and all `session/update` notification types.
- **D-15:** Update `AcpSessionPool` to accept a `sessionMode` option (type: `'agent' | 'plan' | 'ask'`, default: `'agent'`), and pass it in the `session/new` request. This makes intent explicit and keeps the pool future-proof for other modes.

### ThinkingLevel Handling
- **D-16:** `streamSimple()` accepts `options.reasoning?: ThinkingLevel` but does not act on it in Phase 3. The field is silently ignored. Phase 4 (model discovery) will wire up ThinkingLevel-to-Cursor-model mapping. No warning emitted.

### Claude's Discretion
- EventTranslator internal design: how `session/update` notification params map to specific `AssistantMessageEvent` types (`agent_message_chunk` → text events, `agent_thought_chunk` → thinking events, tool call updates → toolcall events)
- Partial `AssistantMessage` state management during streaming (building up the message incrementally for each event's `partial` field)
- How to detect and handle the `done` / stream-end signal from ACP (whether via `session/prompt` response or notification sequence)
- Whether to implement EventTranslator as pure functions, a class, or a generator
- Usage tracking / `Usage` object population (likely zeros for Phase 3, Phase 4 can refine with model metadata)
- AbortSignal integration: which ACP method to call (`session/cancel`) and how to wire signal → cancel → stream.end()

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### ACP Protocol
- `context/cursor_acp.md` — Official ACP protocol documentation. Sections on `session/prompt`, `session/update` notification shape, `session/cancel`, and content block types are critical for EventTranslator design.

### Reference Implementations
- `context/cursor-agent-acp-npm/src/protocol/prompt.ts` — PromptHandler showing how `session/update` notifications are structured and how `sessionUpdate` type discriminates content kinds (`agent_message_chunk`, `agent_thought_chunk`, tool call updates).
- `context/cursor-agent-acp-npm/src/protocol/content.ts` — ContentProcessor showing ACP ContentBlock types and how text/tool content is parsed.

### Existing Codebase (Phase 1 & 2 output)
- `src/session-pool.ts` — `AcpSessionPool` with `getOrCreateSession(cwd)`. Phase 3 needs to add `sessionMode` option and pass `mode` in `session/new`.
- `src/transport.ts` — `AcpTransport` with `notification` event emission. EventTranslator will listen to `notification` events filtered by method `session/update`.
- `src/types.ts` — `JsonRpcNotification`, `JsonRpcServerRequest` types.
- `src/errors.ts` — Error classes available for stream error events.

### GSD-2 Provider System
- `context/gsd-2/packages/pi-ai/src/types.ts` — `AssistantMessageEvent`, `AssistantMessage`, `Context`, `ToolCall`, `StreamOptions`, `SimpleStreamOptions` types. All event `partial` fields require a valid `AssistantMessage` shape.
- `context/gsd-2/packages/pi-ai/src/api-registry.ts` — `ApiProvider` interface, `registerApiProvider()`. Provider must implement `{ api, stream, streamSimple }`.
- `context/gsd-2/packages/pi-ai/src/providers/anthropic.ts` — Reference provider: sync return + async IIFE pattern for `stream()`.
- `context/gsd-2/packages/pi-ai/src/utils/event-stream.ts` — `AssistantMessageEventStream` class with `.push()` and `.end()` methods.
- `context/gsd-2/packages/pi-ai/src/providers/register-builtins.ts` — Where to add `registerApiProvider(cursorAcpProvider)` call.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AcpSessionPool` — Ready to use. Phase 3 adds `sessionMode` option, then calls `getOrCreateSession(process.cwd())` in `stream()`.
- `AcpTransport` — Emits `notification` events. EventTranslator listens for `method === 'session/update'` notifications.
- `AssistantMessageEventStream` — Push-based async iterable. Instantiate, return synchronously, populate asynchronously via `.push()` / `.end()`.
- Error classes (`TransportError`, `ProcessCrashError`, `RequestTimeoutError`, `JsonRpcError`) — Available for error event construction.

### Established Patterns
- **Sync return + async IIFE:** Anthropic provider returns `new AssistantMessageEventStream()` immediately, then fires an async IIFE that populates it. CursorAcpProvider must follow this pattern.
- **EventEmitter-based transport:** AcpTransport emits `notification` events — EventTranslator registers a listener, processes `session/update` params, and pushes events to the stream.
- **Per-cwd session reuse:** `getOrCreateSession(cwd)` returns an existing `sessionId` if one exists for that cwd, or creates a new one.

### Integration Points
- `CursorAcpProvider` consumes `AcpSessionPool` (injected or created internally)
- `CursorAcpProvider.stream()` → `sessionPool.getOrCreateSession(process.cwd())` → `transport.sendRequest('session/prompt', ...)` → listen on `transport 'notification'` events
- `registerApiProvider(cursorAcpProvider)` in `register-builtins.ts` (or a new `register-cursor.ts` since this is a standalone package)
- Phase 3 exports: `CursorAcpProvider`, provider registration function

</code_context>

<specifics>
## Specific Ideas

No specific references — open to standard approaches following the Anthropic provider pattern and ACP spec.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-provider-streaming*
*Context gathered: 2026-03-28*
