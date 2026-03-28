# Phase 1: ACP Transport - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Reliable bidirectional JSON-RPC communication with the `cursor-agent` CLI child process over stdio. This phase delivers the AcpTransport class: spawning the process, sending/receiving newline-delimited JSON-RPC messages, correlating requests to responses by ID, and routing notifications separately. No session management, no event translation, no provider interface — just the transport layer.

</domain>

<decisions>
## Implementation Decisions

### Package Structure
- **D-01:** This repo (gsd-cursor) IS the package. Ships as a standalone npm module (e.g., `@gsd/pi-ai-cursor-acp`). `@gsd/pi-ai` types are a peer dependency. Not inside the GSD-2 monorepo.

### ACP SDK Dependency
- **D-02:** Use `@agentclientprotocol/sdk` for ACP types (InitializeRequest, InitializeResponse, ClientCapabilities, etc.). Keeps types in sync with the ACP protocol spec. The reference adapter (`cursor-agent-acp-npm`) uses this same dependency.

### Process Lifecycle
- **D-03:** On unexpected process crash/exit, auto-restart once. Re-initialize ACP handshake. If second crash occurs within 30 seconds, fail and surface error to caller.
- **D-04:** On host exit (Node.js shutdown), send SIGTERM to cursor-agent process, wait up to 5 seconds for clean exit, then SIGKILL.

### CLI Binary
- **D-05:** Target `cursor-agent` binary (not `cursor agent` subcommand). This is the dedicated agent CLI binary used by the reference adapter. Spawn as `cursor-agent` with appropriate arguments.

### Claude's Discretion
- JSON-RPC message framing details (buffer handling, partial line parsing, max message size)
- Internal error types and error propagation patterns
- Test structure and mock strategies for the transport layer
- Whether to use Node.js `readline` or manual newline splitting for stdout parsing

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### ACP Protocol
- `context/cursor_acp.md` — Official ACP protocol documentation. Defines JSON-RPC message format, initialization sequence, session lifecycle.

### Reference Implementations
- `context/cursor-agent-acp-npm/src/utils/json-rpc.ts` — JSON-RPC 2.0 utilities (validation, error codes, request ID handling)
- `context/cursor-agent-acp-npm/src/cursor/cli-bridge.ts` — CLI process spawning, command execution, timeout handling patterns
- `context/cursor-agent-acp-npm/src/protocol/initialization.ts` — ACP initialization handler with version negotiation, capability building

### GSD-2 Provider System
- `context/gsd-2/packages/pi-ai/src/types.ts` — Core types (Api, Provider, Model, Context, AssistantMessageEvent)
- `context/gsd-2/packages/pi-ai/src/api-registry.ts` — ApiProvider interface, registerApiProvider()
- `context/gsd-2/packages/pi-ai/src/providers/anthropic.ts` — Reference provider (sync return + async IIFE pattern)

### Research
- `.planning/research/ARCHITECTURE.md` — Recommended architecture, component boundaries, data flow, build order
- `.planning/research/FEATURES.md` — Feature landscape, MVP recommendation, complexity assessment

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@agentclientprotocol/sdk` — Provides typed ACP message interfaces (InitializeRequest, ClientCapabilities, AgentCapabilities, etc.)
- `cursor-agent-acp-npm/src/utils/json-rpc.ts` — JSON-RPC utilities that can be referenced for message validation patterns (validateObjectParams, createErrorResponse, createSuccessResponse, error codes)

### Established Patterns
- **Process spawning:** Reference adapter uses `spawn('cursor-agent', args, { stdio: ['pipe', 'pipe', 'pipe'] })` with timeout handling via setTimeout + SIGTERM
- **JSON-RPC framing:** Newline-delimited JSON. Messages with `id` + `result`/`error` are responses; messages with `method` but no `id` are notifications; messages with `method` AND `id` are server-initiated requests (e.g., `session/request_permission`)
- **Request ID handling:** ACP SDK uses `RequestId = null | bigint | string`. Reference adapter converts between numeric IDs and bigint.

### Integration Points
- Transport will be consumed by AcpSessionPool (Phase 2) for lifecycle management
- Transport will be consumed by CursorAcpProvider (Phase 3) for prompt delivery
- No src/ directory exists yet — this is the first code written in the repo

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The reference implementations provide clear patterns to follow.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-acp-transport*
*Context gathered: 2026-03-27*
