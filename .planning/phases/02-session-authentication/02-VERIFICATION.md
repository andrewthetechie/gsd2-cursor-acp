---
phase: 02-session-authentication
verified: 2026-03-28T00:16:00Z
status: human_needed
score: 12/13 must-haves verified
re_verification: false
human_verification:
  - test: "CURSOR_API_KEY --api-key arg passthrough"
    expected: "When CURSOR_API_KEY=mykey, the cursor-agent process is spawned with arguments ['--api-key', 'mykey', 'acp']"
    why_human: "The unit test for this truth only asserts the constructor does not throw — it does not intercept AcpTransport construction to verify binaryArgs. Implementation code (session-pool.ts line 38) is correct but the assertion is a no-op smoke check."
---

# Phase 2: Session Authentication Verification Report

**Phase Goal:** Implement ACP session lifecycle management with authentication and permission handling
**Verified:** 2026-03-28T00:16:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

All truths are drawn from the `must_haves` sections of 02-01-PLAN.md (AUTH-02, AUTH-03) and 02-02-PLAN.md (AUTH-01).

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | PermissionHandler auto-responds to session/request_permission with the correct optionId from the options array | ✓ VERIFIED | `resolvePermission` finds option by kind from array; never hardcodes optionId (permission-handler.ts:43) |
| 2  | auto-approve-all policy approves all tool kinds by selecting allow_once option | ✓ VERIFIED | switch case in resolvePermission calls `selectOption(options, 'allow_once')` for all tools; 3 test cases pass |
| 3  | approve-reads-reject-writes policy approves read/search/think/fetch and rejects edit/delete/move/execute | ✓ VERIFIED | READ_SAFE_KINDS and WRITE_DANGEROUS_KINDS Sets with 11 test cases covering all tool kinds |
| 4  | interactive policy returns cancelled outcome | ✓ VERIFIED | `case 'interactive': return { outcome: 'cancelled' }` (permission-handler.ts:35); 2 test cases pass |
| 5  | AcpSessionPool lazy-initializes on first getOrCreateSession call, not in constructor (D-09) | ✓ VERIFIED | Constructor sets no initPromise; `ensureInitialized()` only called inside `getOrCreateSession`; test case passes |
| 6  | Initialize sends protocolVersion 1, clientCapabilities with fs false/false, terminal false, clientInfo gsd-cursor (AUTH-01) | ✓ VERIFIED | `doInitialize()` lines 166-173 match exactly; test asserts full params object |
| 7  | Authenticate sends methodId cursor_login after initialize (AUTH-01) | ✓ VERIFIED | `sendRequest("authenticate", { methodId: "cursor_login" })` line 176-178; test verifies call order and params |
| 8  | CURSOR_API_KEY env var is passed as --api-key CLI arg to the transport (AUTH-01) | ? UNCERTAIN | Implementation correct (session-pool.ts:36-42) but unit test only checks constructor does not throw — does not verify binaryArgs values |
| 9  | When no CURSOR_API_KEY and no CLI login, throws with message containing "Set CURSOR_API_KEY or run cursor-agent login" (D-07) | ✓ VERIFIED | Error message at line 183 matches; test regex `/Set CURSOR_API_KEY or run/` passes |
| 10 | Sessions are scoped per cwd and reused on repeat calls (D-06) | ✓ VERIFIED | `sessions` Map keyed by cwd; reuse check at line 90; 3 session-scoping test cases all pass |
| 11 | Concurrent getOrCreateSession calls share the same init promise (no double init) | ✓ VERIFIED | `initPromise` mutex in `ensureInitialized()`; `sessionCreating` per-cwd dedup; both concurrent access tests pass |
| 12 | Transport restarting event clears sessions and initialized state | ✓ VERIFIED | `restarting` listener at line 68 clears initialized, initPromise, sessions, sessionAccess; restart test passes |
| 13 | Permission requests from transport are delegated to PermissionHandler and responded via sendResponse | ✓ VERIFIED | `request` event listener at line 51 calls resolvePermission then sendResponse; 3 permission wiring tests pass |

**Score:** 12/13 truths verified (1 uncertain — needs human confirmation)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/permission-handler.ts` | PermissionHandler class with policy-based permission resolution | ✓ VERIFIED | 50 lines, exports PermissionPolicy, RequestPermissionOutcome, PermissionHandler; all 3 exports present |
| `src/permission-handler.test.ts` | Unit tests for all three policy modes and edge cases | ✓ VERIFIED | 137 lines (min_lines: 80 passed); 18 test cases across 4 describe blocks |
| `src/session-pool.ts` | AcpSessionPool class with lazy init, session reuse, permission wiring | ✓ VERIFIED | 208 lines, exports AcpSessionPool and AcpSessionPoolOptions |
| `src/session-pool.test.ts` | Unit tests for session pool lifecycle, auth, session reuse, permission delegation | ✓ VERIFIED | 371 lines (min_lines: 120 passed); 23 test cases across 7 describe blocks |
| `src/index.ts` | Updated barrel exports for all Phase 2 classes and types | ✓ VERIFIED | Exports AcpSessionPool, AcpSessionPoolOptions, and `export *` from permission-handler (PermissionHandler, PermissionPolicy, RequestPermissionOutcome) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/permission-handler.ts` | `@agentclientprotocol/sdk` | imports PermissionOption, PermissionOptionKind types | ✓ WIRED | `import type { PermissionOption, PermissionOptionKind } from "@agentclientprotocol/sdk"` (line 1) |
| `src/session-pool.ts` | `src/transport.ts` | composes AcpTransport, calls sendRequest/sendResponse, listens to request/restarting events | ✓ WIRED | `this.transport.on(...)`, `this.transport.sendRequest(...)`, `this.transport.sendResponse(...)` all present (lines 51, 63, 68, 137, 166, 176) |
| `src/session-pool.ts` | `src/permission-handler.ts` | composes PermissionHandler, delegates resolvePermission | ✓ WIRED | `this.permissionHandler.resolvePermission(...)` line 58; PermissionHandler imported line 4 |
| `src/index.ts` | `src/session-pool.ts` | re-exports AcpSessionPool | ✓ WIRED | `export { AcpSessionPool } from "./session-pool.js"` and `export type { AcpSessionPoolOptions } from "./session-pool.js"` |

### Data-Flow Trace (Level 4)

This phase produces no components that render dynamic data to a UI — it is a library with in-process data flow. Data flows through function calls and resolved Promises, verified directly by the unit test assertions. Level 4 trace not applicable.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 58 tests pass | `npx vitest run` | 3 test files, 58 tests, 0 failures | ✓ PASS |
| TypeScript compiles clean | `npx tsc --noEmit` | Exit 0, no output | ✓ PASS |
| PermissionHandler module exports expected symbols | `export type PermissionPolicy`, `export type RequestPermissionOutcome`, `export class PermissionHandler` present in source | All found | ✓ PASS |
| AcpSessionPool module exports expected symbols | `export interface AcpSessionPoolOptions`, `export class AcpSessionPool` present in source | Both found | ✓ PASS |
| Commits documented in SUMMARYs exist in git | `git log --oneline e48a6ca daa5752 0bcc777 e4b62f6 472f02b` | All 5 commits found | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AUTH-01 | 02-02-PLAN.md | Provider authenticates via CURSOR_API_KEY env var or existing Cursor CLI login | ✓ SATISFIED | ACP handshake (initialize+authenticate) implemented in `doInitialize()`; CURSOR_API_KEY read from env and passed as `--api-key` binaryArgs; fail-fast D-07 error message when authenticate rejects |
| AUTH-02 | 02-01-PLAN.md | Provider auto-responds to session/request_permission with configurable policy (default: allow-once) | ✓ SATISFIED | `request` event listener in AcpSessionPool delegates to PermissionHandler.resolvePermission and calls sendResponse; default policy is `auto-approve-all` which selects allow_once |
| AUTH-03 | 02-01-PLAN.md | Permission policy is configurable (auto-approve-all, approve-reads-reject-writes, interactive) | ✓ SATISFIED | PermissionPolicy type union with 3 values; constructor-injected policy; all three modes fully implemented and tested |

No orphaned requirements: all three AUTH-01/02/03 IDs claimed in PLANs and covered by REQUIREMENTS.md traceability table (Phase 2, Complete).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/session-pool.test.ts` | 146-158 | Test assertion is a no-op smoke check for CURSOR_API_KEY binaryArgs behavior | ⚠️ Warning | The test name claims to verify `--api-key` args are prepended, but the assertion only checks the constructor does not throw. The actual implementation is correct; the coverage gap is in test assertion strength, not production code. |

No blocker anti-patterns. No TODO/FIXME/placeholder comments. No empty implementations or stub returns in production code.

### Human Verification Required

#### 1. CURSOR_API_KEY --api-key binaryArgs Passthrough

**Test:** Set `CURSOR_API_KEY=test-key-abc` in environment and construct `new AcpSessionPool()` without a `transport` injection. Use a spy or interceptor on `AcpTransport` constructor to capture the `binaryArgs` option passed. Alternatively, run an integration test against a mock binary that echoes its argv.

**Expected:** The transport is constructed with `binaryArgs: ['--api-key', 'test-key-abc', 'acp']`

**Why human:** The existing unit test at session-pool.test.ts:146-158 only asserts `expect(() => new AcpSessionPoolClass()).not.toThrow()`. It does not mock or spy on the `AcpTransport` constructor, so binaryArgs cannot be inspected. The implementation code at session-pool.ts:36-42 reads `process.env.CURSOR_API_KEY` and prepends `--api-key` correctly, but this is unconfirmed by automated assertion.

### Gaps Summary

No gaps are blocking goal achievement. The single uncertain item (Truth 8) is a test coverage weakness, not a production code defect. The implementation in `session-pool.ts` lines 36-42 correctly handles `CURSOR_API_KEY`, but the unit test does not assert on the binaryArgs values passed to the AcpTransport constructor. This is appropriate to flag for human verification before marking AUTH-01 fully tested.

All other truths are fully verified with passing tests and traceable code. The phase goal — ACP session lifecycle management with authentication and permission handling — is functionally achieved.

---

_Verified: 2026-03-28T00:16:00Z_
_Verifier: Claude (gsd-verifier)_
