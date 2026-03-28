# Phase 5: Hardening & Verification - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the Cursor ACP provider production-ready: structured error handling for all failure modes (CLI not found, auth failure, session errors), a complete test suite including mocked subprocess integration tests, and setup/usage documentation.

This phase does NOT cover: HTTP transport, MCP passthrough, session mode switching, or contributing docs to GSD-2's main repository.

</domain>

<decisions>
## Implementation Decisions

### CLI Detection (ERRH-01)

- **D-01:** `registerCursorAcpProvider()` performs an upfront binary check (e.g. `execFile cursor-agent --version`) before proceeding. If the binary is not found, it throws `CursorCliNotFoundError` immediately — callers get a clear error at startup, not buried in the first `stream()` call.
- **D-02:** Error message on CLI not found must be actionable: "cursor-agent not found. Install Cursor from https://cursor.com and ensure cursor-agent is on your PATH, then run `cursor-agent login`."

### Error Classes (ERRH-01, ERRH-02, ERRH-03)

- **D-03:** Add three new typed error classes to `src/errors.ts`, all extending `TransportError` (consistent with existing hierarchy):
  - `CursorCliNotFoundError` — binary not on PATH (ERRH-01)
  - `CursorAuthError` — authentication expired or missing (ERRH-02); replaces the current plain `Error` throw in `session-pool.ts`
  - `CursorSessionError` — session/new or session/prompt failures (ERRH-03); more specific than the current generic catch-all in `provider.ts`
- **D-04:** `CursorAuthError` must include the original error cause so callers can inspect it.
- **D-05:** `CursorSessionError` maps to a GSD-2 `error` event via the existing provider catch block — the error type is preserved in the message, stream still ends cleanly.

### E2E / Integration Test Strategy (TEST-02)

- **D-06:** TEST-02 is satisfied by mocked subprocess integration tests — a real Node.js child process that speaks the ACP protocol (JSON-RPC over stdio) acts as a fixture, not actual Cursor. This proves full stack wiring without requiring Cursor installed.
- **D-07:** Integration test suite covers all four paths:
  1. Full stream happy path — spawn mock ACP server, call `stream()`, verify `AssistantMessageEventStream` events (text_delta, text_end, done)
  2. Auth failure path — mock `authenticate` returning error, verify `CursorAuthError` thrown
  3. Session/prompt error path — mock `session/prompt` returning error, verify `CursorSessionError` maps to GSD-2 `error` event
  4. CLI not found path — `registerCursorAcpProvider` with non-existent binary, verify `CursorCliNotFoundError` thrown

### Documentation (TEST-03)

- **D-08:** Produce three documentation artifacts:
  1. `README.md` — installation, configuration (env vars, options), usage example showing `registerCursorAcpProvider()` and `stream()`. Primary audience: GSD-2 integrators.
  2. TSDoc/JSDoc comments on all public exports (`registerCursorAcpProvider`, error classes, `CursorAcpProvider`) in `src/index.ts` and their source files. Enables IDE hover docs.
  3. `TESTING.md` — how to run the test suite, what each test file covers, manual smoke-test steps for verifying against a real Cursor installation.

### Claude's Discretion

- Exact binary detection mechanism — `execFile --version`, `which`, or `accessSync` check. Use whatever is most reliable cross-platform for detecting a missing binary.
- Where the mock ACP server fixture lives — `src/__fixtures__/` or a `test/` top-level directory. Follow existing test file placement patterns.
- Whether `CursorSessionError` wraps both session/new and session/prompt errors, or has subclasses for each. Keep simple unless there's a clear reason to distinguish.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### ACP Protocol
- `context/cursor_acp.md` — Official ACP protocol documentation (session lifecycle, message shapes, error codes)

### Existing Error Infrastructure
- `src/errors.ts` — Current error class hierarchy (`TransportError`, `ProcessCrashError`, `RequestTimeoutError`, `JsonRpcError`) — new classes extend `TransportError`
- `src/session-pool.ts` — Current auth error throw (plain `Error`, lines ~184-191) — replace with `CursorAuthError`
- `src/provider.ts` — Current generic catch-all error mapping (lines ~322-341) — map `CursorSessionError` here

### Existing Test Infrastructure
- `src/transport.test.ts` — 516 lines, transport-level tests (reference for test style)
- `src/session-pool.test.ts` — 371 lines, session pool lifecycle tests
- `src/event-translator.test.ts` — 277 lines, event translation tests
- `src/provider.test.ts` — 294 lines, provider-level tests

### Public API
- `src/index.ts` — Public exports to add JSDoc to
- `src/register.ts` — `registerCursorAcpProvider()` entry point for CLI detection logic

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/errors.ts` `TransportError` — base class for all new error types; `extends TransportError` keeps the hierarchy consistent
- `src/types.ts` `TransportOptions.binaryPath` — use this when performing the upfront binary check, so user-configured binary paths are respected
- `vi.hoisted()` + `Symbol.for('nodejs.util.promisify.custom')` pattern from `register.test.ts` — reuse for mocking `execFile` in CLI detection tests (Phase 4 discovery)

### Established Patterns
- Inline GSD-2 type definitions — all phases define types inline; Phase 5 follows the same pattern
- `initPromise = null` reset on auth failure (session-pool.ts) — already allows retry; new `CursorAuthError` should preserve this reset behavior
- Provider catch-all: catches all errors, calls `stream.push({ type: 'error' ... })` then `stream.end()` — `CursorSessionError` slots into this path naturally

### Integration Points
- `registerCursorAcpProvider()` in `src/register.ts` — add CLI check here before existing model discovery
- `AcpSessionPool.ensureInitialized()` in `src/session-pool.ts` — replace plain `Error` auth throw with `CursorAuthError`
- Provider `streamCursorAcp()` catch block in `src/provider.ts` — update error message extraction to surface typed error names

</code_context>

<specifics>
## Specific Ideas

- The mock ACP subprocess for integration tests should be a small Node.js script that speaks JSON-RPC over stdio — it can be driven from test setup to return specific responses (happy path, auth error, session error). This approach is already partially validated by the existing `transport.test.ts` which tests real stdio communication.
- TSDoc on `registerCursorAcpProvider` should document: the `async` return, the `CursorCliNotFoundError` throw condition, and the `binaryPath` option for custom installs.
- README example should show the minimal setup: `await registerCursorAcpProvider(); const stream = provider.stream(context, model); for await (const event of stream) { ... }`.

</specifics>

<deferred>
## Deferred Ideas

- Contributing docs to GSD-2's main repository — out of scope for this package; GSD-2 maintainers own that integration guide.
- True E2E tests with real Cursor CLI (conditional skip in CI) — deferred; mocked subprocess integration tests satisfy TEST-02.
- ENOENT guard in `AcpTransport` for post-startup binary removal — not implemented; upfront check in `registerCursorAcpProvider` is sufficient.

</deferred>

---

*Phase: 05-hardening-verification*
*Context gathered: 2026-03-28*
