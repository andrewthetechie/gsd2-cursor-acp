---
phase: 05-hardening-verification
plan: 02
subsystem: testing
tags: [vitest, integration-test, mock-subprocess, json-rpc, tsdoc, documentation]

requires:
  - phase: 05-01
    provides: CursorCliNotFoundError, CursorAuthError, CursorSessionError classes and registerCursorAcpProvider binary check

provides:
  - Mock ACP subprocess fixture (src/__fixtures__/mock-acp-server.mjs) for integration tests
  - Four-path integration test suite proving full stack wiring without real Cursor
  - README.md with installation, configuration, usage, and error handling documentation
  - TESTING.md with test file descriptions, run commands, and manual smoke test steps
  - TSDoc on CursorCliNotFoundError, CursorAuthError, CursorSessionError in src/errors.ts
  - TSDoc with @throws on registerCursorAcpProvider in src/register.ts
  - TSDoc on streamCursorAcp and cursorAcpProvider in src/provider.ts

affects: []

tech-stack:
  added: []
  patterns:
    - "_setPoolForTest() injection pattern for testing streamCursorAcp with custom AcpSessionPool"
    - "Mock subprocess receives --scenario=<name> arg to select behavior branch"
    - "agent_message_chunk sessionUpdate shape required for AcpEventTranslator text_delta events"

key-files:
  created:
    - src/__fixtures__/mock-acp-server.mjs
    - src/integration.test.ts
    - README.md
    - TESTING.md
  modified:
    - src/errors.ts
    - src/register.ts
    - src/provider.ts

key-decisions:
  - "Mock server uses sessionUpdate: 'agent_message_chunk' (not type: 'text') to match ACP SDK SessionUpdate shape consumed by AcpEventTranslator.handleUpdate()"
  - "Integration tests inject pool via _setPoolForTest() since streamCursorAcp uses a module-level singleton; reset with _setPoolForTest(null) in afterEach"

patterns-established:
  - "Mock ACP subprocess pattern: plain ESM script, --scenario arg selects behavior, responds over stdio"
  - "Integration test isolation: _setPoolForTest for singleton injection, pool.shutdown() in afterEach"

requirements-completed:
  - TEST-02
  - TEST-03

duration: 15min
completed: 2026-03-28
---

# Phase 05 Plan 02: Integration Tests, README, TESTING, TSDoc Summary

**Mock ACP subprocess with four integration scenarios (happy-path, auth-error, session-error, cli-not-found) plus README.md, TESTING.md, and TSDoc on all public error/provider exports**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-28T11:42:00Z
- **Completed:** 2026-03-28T11:57:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Created `src/__fixtures__/mock-acp-server.mjs` — plain ESM mock ACP subprocess that handles JSON-RPC over stdio for four scenarios
- Created `src/integration.test.ts` — all four paths pass: happy-path (text_delta + done), auth-error (CursorAuthError), session-error (error event with CursorSessionError), cli-not-found (CursorCliNotFoundError)
- Written README.md at project root with installation, prerequisites, configuration, usage example, error handling table, permission policy, and advanced binaryPath docs
- Written TESTING.md at project root with run commands, test file descriptions table, manual smoke test steps, and notes on vi.hoisted() and _setPoolForTest patterns
- Added TSDoc to CursorCliNotFoundError, CursorAuthError, CursorSessionError (src/errors.ts)
- Added TSDoc with @param, @throws, @example to registerCursorAcpProvider (src/register.ts)
- Added TSDoc to streamCursorAcp and cursorAcpProvider (src/provider.ts)

## Task Commits

1. **Task 1: Mock ACP server fixture and integration test suite** - `2180693` (feat)
2. **Task 2: README.md, TESTING.md, and TSDoc on public exports** - `9d05ce6` (feat)

## Files Created/Modified

- `src/__fixtures__/mock-acp-server.mjs` - Mock ACP subprocess with scenario switching; responds with agent_message_chunk, auth errors, session errors
- `src/integration.test.ts` - Four integration tests using _setPoolForTest injection pattern; all pass without Cursor installed
- `README.md` - Installation, configuration, usage, error handling, permission policy, advanced options
- `TESTING.md` - Test file descriptions, run commands, manual smoke test steps
- `src/errors.ts` - Added TSDoc to CursorCliNotFoundError, CursorAuthError, CursorSessionError
- `src/register.ts` - Replaced implementation notes with proper TSDoc including @throws {CursorCliNotFoundError}
- `src/provider.ts` - Added TSDoc to streamCursorAcp and cursorAcpProvider

## Decisions Made

- Mock server sends `sessionUpdate: 'agent_message_chunk'` (not `type: 'text'`) because `AcpEventTranslator.handleUpdate()` dispatches on `update.sessionUpdate` per the ACP SDK's `SessionUpdate` type — the plan's suggested `{ type: 'text', text: '...' }` would have produced no events.
- Integration tests use `_setPoolForTest(pool)` to inject a custom pool into `streamCursorAcp` since the function reads from a module-level singleton (`_pool`). This avoids needing to modify provider.ts and reuses the existing test escape hatch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed mock server session/update notification shape to match AcpEventTranslator**
- **Found during:** Task 1 (integration test verification)
- **Issue:** Plan's suggested notification used `{ type: 'text', text: '...' }` inside `update`, but `AcpEventTranslator.handleUpdate()` dispatches on `update.sessionUpdate` (ACP SDK type). With the wrong shape, text_delta events were never emitted.
- **Fix:** Changed mock server to emit `{ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hello from mock' } }` — matches the ACP SDK's `ContentChunk & { sessionUpdate: 'agent_message_chunk' }` union.
- **Files modified:** src/__fixtures__/mock-acp-server.mjs
- **Verification:** happy-path test emits text_delta and done events; all four tests pass

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Fix essential for correctness — without it the happy-path test would fail to emit text_delta events. No scope creep.

## Issues Encountered

None - full test suite (114 tests) passes and typecheck is clean.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 5 is now complete. The full milestone (v1.0 Cursor ACP Provider) is ready:
- All unit tests passing (transport, session-pool, event-translator, permission-handler, provider, register)
- Four integration scenarios verified against mock subprocess
- Documentation complete (README, TESTING, TSDoc)
- TypeScript strict check clean

---
*Phase: 05-hardening-verification*
*Completed: 2026-03-28*
