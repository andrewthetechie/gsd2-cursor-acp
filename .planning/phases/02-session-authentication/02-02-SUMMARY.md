---
phase: 02-session-authentication
plan: 02
subsystem: session-pool
tags: [session-management, auth, lazy-init, tdd, acp, permissions]
dependency_graph:
  requires: [PermissionHandler, AcpTransport]
  provides: [AcpSessionPool, AcpSessionPoolOptions]
  affects: [src/index.ts]
tech_stack:
  added: []
  patterns: [lazy-init-mutex, lru-eviction, event-driven-permission-wiring, tdd-red-green]
key_files:
  created:
    - src/session-pool.ts
    - src/session-pool.test.ts
  modified:
    - src/index.ts
decisions:
  - Added per-cwd session creation deduplication (sessionCreating Map) to prevent concurrent calls for same cwd from creating duplicate sessions
  - Mutex via initPromise shared across all concurrent callers; separate mutex per cwd for session/new calls
metrics:
  duration: 4min
  completed: 2026-03-28
  tasks_completed: 3
  files_created: 2
  files_modified: 1
---

# Phase 2 Plan 2: AcpSessionPool Summary

**One-liner:** Lazy-initializing AcpSessionPool with ACP handshake (initialize+authenticate), per-cwd session reuse, LRU eviction, transport restart recovery, and permission delegation to PermissionHandler.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | AcpSessionPool tests (RED phase) | 0bcc777 | src/session-pool.test.ts |
| 2 | AcpSessionPool implementation (GREEN phase) | e4b62f6 | src/session-pool.ts |
| 3 | Update barrel exports and typecheck | 472f02b | src/index.ts, src/session-pool.test.ts |

## What Was Built

`src/session-pool.ts` — AcpSessionPool class with:

- `AcpSessionPoolOptions` interface: transport injection, transportOptions, permissionPolicy, maxSessions
- `AcpSessionPool` class with `getOrCreateSession(cwd)` and `shutdown()`
- Lazy initialization via `ensureInitialized()` mutex: `initPromise` shared across concurrent callers (Pitfall 1 prevention)
- ACP handshake in `doInitialize()`: `transport.start()` -> `initialize` (AUTH-01 params) -> `authenticate({ methodId: "cursor_login" })`
- CURSOR_API_KEY env var prepended as `--api-key KEY acp` args when creating internal transport (AUTH-01, Pitfall 3)
- Fail-fast D-07 error: "Authentication failed. Set CURSOR_API_KEY or run `cursor-agent login`."
- Per-cwd session reuse: Map<cwd, sessionId> with deduplication of concurrent session/new calls via `sessionCreating` Map
- LRU eviction via `sessionAccess` timestamps when `sessions.size >= maxSessions` (default 10)
- Transport restart recovery: `restarting` event clears sessions, initPromise, initialized flag (Pitfall 5)
- Permission request delegation: `request` event listener calls `PermissionHandler.resolvePermission()` and responds via `transport.sendResponse()` (AUTH-02)

`src/session-pool.test.ts` — 23 test cases across 7 `describe` blocks:
- `lazy initialization`: 4 cases (no I/O in constructor, first call sequence, no reinit on repeat)
- `authentication`: 4 cases (correct AUTH-01 params, D-07 error message, API key env)
- `session scoping`: 3 cases (session/new params, reuse by cwd, separate sessions for different cwds)
- `concurrent access`: 2 cases (shared initPromise, shared session creation for same cwd)
- `transport restart`: 1 case (re-init after restarting event)
- `permission wiring`: 3 cases (sendResponse called, non-permission ignored, auto-approve-all policy)
- `shutdown`: 2 cases (transport.shutdown called, re-init after shutdown)

`src/index.ts` — Updated barrel with Phase 2 exports:
- `export * from "./permission-handler.js"` (PermissionHandler, PermissionPolicy, RequestPermissionOutcome)
- `export { AcpSessionPool } from "./session-pool.js"`
- `export type { AcpSessionPoolOptions } from "./session-pool.js"`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added per-cwd session creation deduplication**
- **Found during:** Task 2 (GREEN phase verification)
- **Issue:** Concurrent `getOrCreateSession("/project")` calls both entered the session creation code path before either stored the result in the sessions Map, producing two separate sessions for the same cwd and failing the concurrent access test.
- **Fix:** Added `sessionCreating: Map<string, Promise<string>>` as a per-cwd in-flight promise. Concurrent callers share the same `doCreateSession` promise for the same cwd.
- **Files modified:** src/session-pool.ts
- **Commit:** e4b62f6

**2. [Rule 1 - Bug] Fixed TypeScript type errors in test filter/map callbacks**
- **Found during:** Task 3 (typecheck)
- **Issue:** `mock.calls` is typed as `unknown[][]`, so map callbacks typed as `(m: string)` failed type checking. Non-null assertions needed after `find()` with `expect(x).toBeDefined()`.
- **Fix:** Changed `map` callbacks to cast: `(c: unknown[]) => c[0] as string`. Added `!` non-null assertion after `find()` results.
- **Files modified:** src/session-pool.test.ts
- **Commit:** 472f02b

## Known Stubs

None - AcpSessionPool is a complete, wire-ready implementation.

## Self-Check

Files exist:
- src/session-pool.ts: FOUND
- src/session-pool.test.ts: FOUND
- src/index.ts: FOUND (modified)

Commits exist:
- 0bcc777 (test RED): FOUND
- e4b62f6 (feat GREEN): FOUND
- 472f02b (feat exports+types): FOUND

All 58 tests pass (19 session-pool + 18 permission-handler + 21 transport). TypeScript compiles with no errors.

## Self-Check: PASSED
