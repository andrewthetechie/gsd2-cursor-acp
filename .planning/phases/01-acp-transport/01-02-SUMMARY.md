---
phase: 01-acp-transport
plan: 02
subsystem: transport
tags: [typescript, json-rpc, acp, stdio, eventemitter, child-process, vitest]

# Dependency graph
requires:
  - phase: 01-acp-transport plan 01
    provides: TypeScript project scaffold, JSON-RPC types, transport error classes, TransportOptions
provides:
  - AcpTransport class -- EventEmitter subclass for JSON-RPC 2.0 over stdio to cursor-agent acp
  - 3-way message routing (response, notification, server-request)
  - Auto-restart on crash (D-03) with crash window tracking
  - Graceful shutdown SIGTERM/SIGKILL (D-04)
  - Request/response correlation by numeric message ID with timeout
  - 21 unit tests covering all TRAN requirements
affects: [02-acp-lifecycle]

# Tech tracking
tech-stack:
  added: []
  patterns: ["EventEmitter subclass for typed event routing", "readline for newline-delimited JSON parsing", "PassThrough stream mocking for child process tests", "vi.useFakeTimers for timeout/crash-window testing"]

key-files:
  created:
    - src/transport.ts
    - src/transport.test.ts
  modified:
    - src/index.ts

key-decisions:
  - "Used object type for writeMessage parameter to avoid Record<string,unknown> incompatibility with typed interfaces"

patterns-established:
  - "Mock child process with PassThrough streams and EventEmitter for unit testing transport layer"
  - "Catch-then-assert pattern for testing promise rejections with fake timers to avoid unhandled rejection warnings"
  - "3-way message routing: response (has id + result/error) > server-request (has method + id) > notification (has method, no id)"

requirements-completed: [TRAN-01, TRAN-02, TRAN-03]

# Metrics
duration: 9min
completed: 2026-03-28
---

# Phase 01 Plan 02: AcpTransport Implementation Summary

**AcpTransport EventEmitter class with JSON-RPC 2.0 stdio transport, 3-way message routing, auto-restart crash recovery, and graceful shutdown**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-28T04:24:23Z
- **Completed:** 2026-03-28T04:33:13Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 3

## Accomplishments
- Implemented AcpTransport class (260 lines) managing cursor-agent acp child process over stdio
- Built 3-way JSON-RPC message routing: responses resolve/reject pending promises, notifications emit events, server-requests emit events for sendResponse
- Implemented D-03 crash recovery: auto-restart once within 30s window, fatal error on second crash
- Implemented D-04 graceful shutdown: SIGTERM then SIGKILL after 5s timeout
- Created comprehensive test suite (21 tests) using mock child processes with PassThrough streams

## Task Commits

Each task was committed atomically (TDD flow):

1. **Task 1 RED: Failing tests** - `912d518` (test)
2. **Task 1 GREEN: AcpTransport implementation** - `9f5543d` (feat)

## Files Created/Modified
- `src/transport.ts` - AcpTransport class: spawn, sendRequest, sendResponse, sendNotification, shutdown, crash recovery
- `src/transport.test.ts` - 21 unit tests covering TRAN-01/02/03 with mock child process
- `src/index.ts` - Added AcpTransport re-export

## Decisions Made
- Used `object` type for internal `writeMessage` parameter instead of `Record<string, unknown>` to avoid TypeScript index signature incompatibility with typed interfaces like `JsonRpcRequest`
- Used `catch-then-assert` pattern for promise rejection tests with fake timers to prevent unhandled rejection warnings in vitest

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Fake timers interact with readline's internal microtick processing, causing 3 crash/restart tests to take ~5s each in afterEach cleanup when switching from fake to real timers. Tests still pass correctly; this is a test infrastructure artifact, not a production issue.
- Initial test implementation had unhandled promise rejections from async rejection + fake timer interaction. Fixed by using catch-then-assert pattern instead of expect().rejects.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all functionality is fully wired.

## Next Phase Readiness
- AcpTransport is exported from `src/index.ts` as public API
- Ready for Phase 2 (AcpSessionPool / ACP lifecycle will consume AcpTransport)
- All 3 TRAN requirements (TRAN-01, TRAN-02, TRAN-03) satisfied with passing tests
- No blockers

## Self-Check: PASSED

All 3 created/modified files verified on disk. Both task commits (912d518, 9f5543d) verified in git log.

---
*Phase: 01-acp-transport*
*Completed: 2026-03-28*
