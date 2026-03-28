# Requirements: GSD-Cursor

**Defined:** 2026-03-27
**Core Value:** GSD-2 subagents can seamlessly use Cursor as their coding backend — same interface as Anthropic or Google providers, but powered by Cursor's agent with full ACP protocol support.

## v1.0 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Transport

- [x] **TRAN-01**: ACP transport sends and receives JSON-RPC messages over stdio to `cursor agent acp` child process
- [x] **TRAN-02**: Transport manages long-lived child process (spawn once, reuse across requests)
- [x] **TRAN-03**: Transport correlates JSON-RPC requests/responses by message ID

### Provider

- [ ] **PROV-01**: Provider implements `ApiProvider` interface with `stream()` and `streamSimple()` methods
- [ ] **PROV-02**: Provider returns `AssistantMessageEventStream` synchronously, populates asynchronously
- [ ] **PROV-03**: Provider registers as `"cursor-acp"` API type via `registerApiProvider()`

### Streaming

- [ ] **STRM-01**: Provider maps ACP `session/update` notifications to `AssistantMessageEventStream` events (text_delta, text_end, done, error)
- [ ] **STRM-02**: Provider maps tool call updates to toolcall_start/toolcall_end events
- [ ] **STRM-03**: Provider extracts thinking/reasoning content to thinking_start/thinking_delta/thinking_end events
- [ ] **STRM-04**: Provider supports cancellation via AbortSignal, sending `session/cancel` to ACP

### Models

- [ ] **MODL-01**: Provider discovers available models dynamically from Cursor CLI at startup
- [ ] **MODL-02**: Discovered models registered with metadata (context window, capabilities, cost)
- [ ] **MODL-03**: Provider maps GSD-2 canonical model IDs and ThinkingLevel to Cursor model variants

### Auth

- [x] **AUTH-01**: Provider authenticates via `CURSOR_API_KEY` env var or existing Cursor CLI login
- [x] **AUTH-02**: Provider auto-responds to `session/request_permission` with configurable policy (default: allow-once)
- [x] **AUTH-03**: Permission policy is configurable (auto-approve-all, approve-reads-reject-writes, interactive)

### Errors

- [ ] **ERRH-01**: Provider detects and reports when Cursor CLI is not installed
- [ ] **ERRH-02**: Provider handles expired/missing authentication with clear error messages
- [ ] **ERRH-03**: Provider handles session creation and prompt errors, mapping to GSD-2 error events

### Testing

- [ ] **TEST-01**: Unit tests cover event translator, transport message handling, and session pool logic
- [ ] **TEST-02**: End-to-end tests prove ACP integration works with real Cursor CLI
- [ ] **TEST-03**: Setup, configuration, and usage documentation provided

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Session Management

- **SESS-01**: Session mode switching between agent/plan/ask modes
- **SESS-02**: Session resume/load for long-running tasks surviving restarts
- **SESS-03**: Cursor extension method support (cursor/ask_question, cursor/create_plan, cursor/task)

### Advanced Features

- **ADVF-01**: MCP server passthrough to Cursor sessions
- **ADVF-02**: Filesystem operations via ACP (fs/read_text_file, fs/write_text_file)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Standalone ACP adapter | This is a GSD-2 provider plugin, not a general-purpose adapter |
| `--print` mode fallback | Two code paths doubles maintenance; pi-cursor-provider already covers this |
| Custom tool registration with Cursor | GSD-2 and Cursor have separate tool systems; bidirectional tools add confusion |
| HTTP transport | ACP specifies stdio; HTTP adds unnecessary complexity for local CLI |
| Direct model API calls | Defeats the purpose — users want Cursor's subscription and tools |
| Image input passthrough | Cursor CLI does not support image attachments |
| Bidirectional filesystem operations | GSD-2 handles file operations through its own tools |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TRAN-01 | Phase 1 | Complete |
| TRAN-02 | Phase 1 | Complete |
| TRAN-03 | Phase 1 | Complete |
| PROV-01 | Phase 3 | Pending |
| PROV-02 | Phase 3 | Pending |
| PROV-03 | Phase 3 | Pending |
| STRM-01 | Phase 3 | Pending |
| STRM-02 | Phase 3 | Pending |
| STRM-03 | Phase 3 | Pending |
| STRM-04 | Phase 3 | Pending |
| MODL-01 | Phase 4 | Pending |
| MODL-02 | Phase 4 | Pending |
| MODL-03 | Phase 4 | Pending |
| AUTH-01 | Phase 2 | Complete |
| AUTH-02 | Phase 2 | Complete |
| AUTH-03 | Phase 2 | Complete |
| ERRH-01 | Phase 5 | Pending |
| ERRH-02 | Phase 5 | Pending |
| ERRH-03 | Phase 5 | Pending |
| TEST-01 | Phase 5 | Pending |
| TEST-02 | Phase 5 | Pending |
| TEST-03 | Phase 5 | Pending |

**Coverage:**
- v1.0 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0

---
*Requirements defined: 2026-03-27*
*Last updated: 2026-03-27 after roadmap creation*
