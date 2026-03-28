---
phase: 05-hardening-verification
plan: 01
subsystem: error-handling
tags: [typescript, errors, typed-errors, transport, cursor-acp]

# Dependency graph
requires:
  - phase: 04-model-discovery
    provides: "register.ts with discoverModelIds, session-pool.ts with auth flow, provider.ts with catch block"
provides:
  - "Three typed error classes: CursorCliNotFoundError, CursorAuthError, CursorSessionError"
  - "Upfront CLI binary check in registerCursorAcpProvider before model discovery"
  - "CursorAuthError replacing plain Error in session-pool authenticate catch with cause preserved"
  - "CursorSessionError wrapping in provider catch block surfaced in errorMessage field"
  - "Unit test coverage for all three error classes and their call sites"
affects: [05-hardening-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Typed error hierarchy: all new errors extend TransportError and set this.name"
    - "Upfront binary probe pattern: --version check before --list-models in registerCursorAcpProvider"
    - "Cause preservation: CursorAuthError and CursorSessionError store original cause as readonly field"
    - "Error wrapping in catch: instanceof guard avoids double-wrapping CursorSessionError"

key-files:
  created: []
  modified:
    - src/errors.ts
    - src/register.ts
    - src/session-pool.ts
    - src/provider.ts
    - src/register.test.ts
    - src/session-pool.test.ts
    - src/provider.test.ts

key-decisions:
  - "All three new error classes extend TransportError (per D-03), not Error directly, so callers can instanceof-check the whole hierarchy"
  - "CursorCliNotFoundError has no constructor params — message is a static actionable string per D-02"
  - "Binary check uses --version with 5s timeout before --list-models; ENOENT throws CursorCliNotFoundError, other errors throw generic Error"
  - "initPromise = null is preserved before CursorAuthError throw to enable retry after auth fix"

patterns-established:
  - "Error wrapping pattern: `err instanceof CursorSessionError ? err : new CursorSessionError(msg, err)` prevents double-wrap"
  - "Error surfacing pattern: errorMessage field uses `sessionErr.name: sessionErr.message` format for typed prefix in UI"

requirements-completed: [ERRH-01, ERRH-02, ERRH-03, TEST-01]

# Metrics
duration: 3min
completed: 2026-03-28
---

# Phase 5 Plan 1: Typed Error Classes Summary

**Three typed error classes (CursorCliNotFoundError, CursorAuthError, CursorSessionError) wired to CLI binary check, auth catch block, and provider catch block; 110 tests all passing**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-28T16:37:44Z
- **Completed:** 2026-03-28T16:40:17Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added CursorCliNotFoundError, CursorAuthError, and CursorSessionError to src/errors.ts, all extending TransportError and setting this.name
- Wired upfront `--version` binary probe into registerCursorAcpProvider (before discoverModelIds); ENOENT throws CursorCliNotFoundError
- Replaced plain Error throw with CursorAuthError in session-pool authenticate catch, preserving original cause and allowing retry via initPromise = null
- Updated provider catch block to wrap errors as CursorSessionError and surface `name: message` format in errorMessage field
- Added 15 new unit tests (5 register, 3 session-pool, 2 provider) covering all three error classes and call-site behaviors

## Task Commits

1. **Task 1: Add error classes and wire call sites** - `bf483d0` (feat)
2. **Task 2: Add unit tests** - `1c1d695` (test)

## Files Created/Modified

- `src/errors.ts` - Added CursorCliNotFoundError, CursorAuthError, CursorSessionError extending TransportError
- `src/register.ts` - Added CursorCliNotFoundError import and --version binary probe before discoverModelIds
- `src/session-pool.ts` - Added CursorAuthError import and replaced plain Error throw with CursorAuthError preserving cause
- `src/provider.ts` - Added CursorSessionError import and instanceof guard in catch block; errorMessage uses typed prefix
- `src/register.test.ts` - Added 5 new tests for ENOENT/non-ENOENT binary check failures and call ordering
- `src/session-pool.test.ts` - Added 3 new tests for CursorAuthError throw, cause preservation, and retry behavior
- `src/provider.test.ts` - Added 2 new tests for CursorSessionError prefix in errorMessage

## Decisions Made

- CursorCliNotFoundError has no constructor params — message is static per D-02; callers cannot accidentally pass wrong message
- All three new errors extend TransportError per D-03 so callers can instanceof-check the whole hierarchy with a single base type
- initPromise = null preserved BEFORE throw in session-pool to allow retry after user fixes auth (existing pattern kept intact)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three typed error classes are re-exported via the existing `export * from "./errors.js"` wildcard in src/index.ts
- Callers can now instanceof-check CursorCliNotFoundError at startup, CursorAuthError for auth failures, CursorSessionError for streaming failures
- Ready for Phase 5 Plan 2

---
*Phase: 05-hardening-verification*
*Completed: 2026-03-28*
