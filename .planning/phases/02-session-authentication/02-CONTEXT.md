# Phase 2: Session & Authentication - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

ACP session lifecycle management and permission handling. This phase delivers: AcpSessionPool (manages initialize → authenticate → session/new → session/prompt lifecycle), PermissionHandler (auto-responds to session/request_permission with configurable policy), and authentication support (CURSOR_API_KEY env var or existing CLI login). Builds on Phase 1's AcpTransport for all JSON-RPC communication.

</domain>

<decisions>
## Implementation Decisions

### Session Scoping
- **D-06:** Sessions are scoped per working directory. One ACP session per unique cwd, reused across multiple stream() calls targeting the same directory. AcpSessionPool maintains a Map<cwd, sessionId> for lookup. New cwd → new session via `session/new`. Same cwd → reuse existing session via `session/prompt`.

### Auth Flow
- **D-07:** Fail fast with a clear error when authentication fails. If CURSOR_API_KEY is not set and Cursor CLI login hasn't been done, throw immediately with message: "Set CURSOR_API_KEY or run `cursor-agent login`". No automatic login attempts. No retry. Caller decides how to handle.

### Permission Config API
- **D-08:** Permission policy configured via constructor option on AcpSessionPool. Type-safe enum: `'auto-approve-all' | 'approve-reads-reject-writes' | 'interactive'`. Default: `'auto-approve-all'` (for subagent use). Passed down to PermissionHandler internally.

### Init Timing
- **D-09:** Lazy initialization. ACP initialize/authenticate handshake happens on first request (first call to getOrCreateSession). No startup cost. First call pays the latency. AcpSessionPool constructor does not trigger any I/O.

### Claude's Discretion
- Internal session cleanup strategy (idle timeout, max sessions, etc.)
- Whether to cache the authentication result or re-check on each new session
- PermissionHandler internal design (class vs function, stateful vs stateless)
- How to handle the `session/request_permission` options array mapping to the three policy modes

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### ACP Protocol
- `context/cursor_acp.md` — ACP protocol documentation. Sections on initialization, authentication, session lifecycle, and permission requests.

### Reference Implementations
- `context/cursor-agent-acp-npm/src/protocol/initialization.ts` — ACP initialization handler with version negotiation, capability building, connectivity testing
- `context/cursor-agent-acp-npm/src/protocol/permissions.ts` — PermissionsHandler with tool-kind-based default outcomes, option validation, session cancellation
- `context/cursor-agent-acp-npm/src/session/manager.ts` — Session management patterns

### Existing Codebase (Phase 1 output)
- `src/transport.ts` — AcpTransport class with sendRequest(), sendResponse(), sendNotification(), event emitting
- `src/types.ts` — TransportOptions, JsonRpcRequest/Response/Notification, PendingRequest types
- `src/errors.ts` — ProcessCrashError, RequestTimeoutError, JsonRpcError, TransportError

### GSD-2 Provider System
- `context/gsd-2/packages/pi-ai/src/types.ts` — Core types
- `context/gsd-2/packages/pi-ai/src/env-api-keys.ts` — API key env var resolution pattern

### Research
- `.planning/research/ARCHITECTURE.md` — AcpSessionPool component boundary, data flow, session reuse strategy

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AcpTransport` — Ready to use for all JSON-RPC communication. Emits `notification`, `request`, `error` events. Has `sendRequest()`, `sendResponse()`, `start()`, `shutdown()`.
- `@agentclientprotocol/sdk` — Already installed. Provides `InitializeRequest`, `InitializeResponse`, `ClientCapabilities`, `RequestPermissionRequest`, `PermissionOption` types.
- `TransportError`, `ProcessCrashError`, `RequestTimeoutError`, `JsonRpcError` — Error classes from Phase 1.

### Established Patterns
- EventEmitter-based transport with typed events
- Promise-based request/response via pending map
- Newline-delimited JSON-RPC over stdio

### Integration Points
- AcpSessionPool will consume AcpTransport (composition, not inheritance)
- AcpSessionPool will be consumed by CursorAcpProvider (Phase 3) via `getOrCreateSession(cwd)`
- PermissionHandler will listen to AcpTransport's `request` event for `session/request_permission` method
- PermissionHandler responds via AcpTransport's `sendResponse()`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches following the reference implementation patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-session-authentication*
*Context gathered: 2026-03-28*
