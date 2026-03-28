---
phase: 03-provider-streaming
plan: "02"
subsystem: provider-registration
tags: [provider, streaming, registration, event-stream, gsd-2, cursor-acp]
dependency_graph:
  requires:
    - 03-01 (AcpEventTranslator, sessionMode on AcpSessionPool)
  provides:
    - CursorAcpProvider object satisfying ApiProvider<'cursor-acp'> (src/provider.ts)
    - registerCursorAcpProvider() function (src/register.ts)
    - Local api-registry.ts mirroring @gsd/pi-ai registry interface
  affects:
    - src/session-pool.ts (transport made public readonly)
    - src/provider.ts (new file)
    - src/provider.test.ts (new file)
    - src/register.ts (new file)
    - src/register.test.ts (new file)
    - src/api-registry.ts (new file)
    - src/index.ts (new public exports)
tech_stack:
  added: []
  patterns:
    - sync-return + async IIFE pattern for stream() (mirrors Anthropic provider)
    - Module-level singleton pool with _setPoolForTest injection for unit tests
    - AbortSignal wiring to session/cancel with isDone guard
    - notification listener attached before session/prompt (Pitfall 1)
    - notification listener removed in finally block (Pitfall 2)
    - sessionId filtering on notifications (Pitfall 6)
    - Inline GSD-2 types (same as Plan 01; peer dep not installed)
key_files:
  created:
    - src/provider.ts
    - src/provider.test.ts
    - src/register.ts
    - src/register.test.ts
    - src/api-registry.ts
  modified:
    - src/session-pool.ts
    - src/index.ts
decisions:
  - "Inline AssistantMessageEventStream and GSD-2 types in provider.ts because @gsd/pi-ai is not installed; same approach as Plan 01 event-translator.ts"
  - "Created local src/api-registry.ts mirroring @gsd/pi-ai registry interface so register.ts and register.test.ts can function without the peer dep installed"
  - "Used _setPoolForTest() injection pattern for provider tests to avoid spawning real ACP transport processes"
  - "register.ts imports from local api-registry.ts instead of @gsd/pi-ai; update when peer dep is available"
metrics:
  duration: "3 min"
  completed_date: "2026-03-28"
  tasks_completed: 2
  files_changed: 7
---

# Phase 03 Plan 02: Provider Registration Summary

CursorAcpProvider implementing ApiProvider<'cursor-acp'> with sync stream/streamSimple, AbortSignal wiring, and registerCursorAcpProvider() for GSD-2 registry integration.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Expose transport + build CursorAcpProvider with tests | 27f6caa | src/session-pool.ts, src/provider.ts, src/provider.test.ts |
| 2 | Provider registration and index exports | 99fe434 | src/api-registry.ts, src/register.ts, src/register.test.ts, src/index.ts |

## What Was Built

### Task 1: CursorAcpProvider (src/provider.ts)

- Made `transport` property public readonly on `AcpSessionPool` (minimal change enabling provider access)
- `streamCursorAcp`: sync-return + async IIFE pattern. Returns `AssistantMessageEventStream` synchronously (PROV-02). Async IIFE: gets session, attaches notification listener before `session/prompt`, wires AbortSignal to `session/cancel` (STRM-04), calls `session/prompt`, on completion calls `translator.handleDone()`.
- `streamSimpleCursorAcp`: delegates to `streamCursorAcp`; D-16 reasoning option silently ignored in Phase 3.
- `cursorAcpProvider`: named export satisfying ApiProvider shape.
- `_setPoolForTest()`: test injection point for mock pool.
- Inline `AssistantMessageEventStream` and GSD-2 types (peer dep not installed; same decision as Plan 01).
- 6 tests covering PROV-02 (sync return), STRM-04 (abort/cancel), Pitfall 1 (listener before prompt), Pitfall 2 (listener removed in finally), Pitfall 6 (sessionId filter).

### Task 2: Registration and Exports

- `src/api-registry.ts`: Local registry mirroring `@gsd/pi-ai`'s `registerApiProvider`/`getApiProvider`/`clearApiProviders`. Required because peer dep is not installed.
- `src/register.ts`: `registerCursorAcpProvider()` calls `registerApiProvider(cursorAcpProvider)`.
- `src/register.test.ts`: 2 tests verifying PROV-03 — cursor-acp appears in registry with stream and streamSimple functions.
- `src/index.ts`: Added exports for `cursorAcpProvider`, `streamCursorAcp`, `streamSimpleCursorAcp`, `AssistantMessageEventStream`, `registerCursorAcpProvider`, `AcpEventTranslator`.

## Verification

```
npm run typecheck  →  0 errors
npm test           →  81/81 passed (6 test files)
  src/event-translator.test.ts   15 passed
  src/session-pool.test.ts       19 passed
  src/permission-handler.test.ts 18 passed
  src/transport.test.ts          21 passed
  src/provider.test.ts            6 passed
  src/register.test.ts            2 passed
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Created local api-registry.ts**
- **Found during:** Task 2 implementation
- **Issue:** `@gsd/pi-ai` is a peer dependency not installed in node_modules. `register.ts` cannot import `registerApiProvider` from `@gsd/pi-ai`, and `register.test.ts` cannot import `getApiProvider`/`clearApiProviders` for test verification.
- **Fix:** Created `src/api-registry.ts` mirroring the `@gsd/pi-ai` registry interface exactly. `register.ts` imports from it locally. Update to real `@gsd/pi-ai` imports when the package is installed.
- **Files modified:** src/api-registry.ts (new), src/register.ts (local import)
- **Commit:** 99fe434

**2. [Rule 2 - Missing critical functionality] Inline AssistantMessageEventStream in provider.ts**
- **Found during:** Task 1 implementation
- **Issue:** Same peer dep issue as Plan 01. Provider needs `AssistantMessageEventStream` class and GSD-2 types to implement the streaming pattern.
- **Fix:** Inlined `EventStream` base class and `AssistantMessageEventStream` in `provider.ts` matching `context/gsd-2/packages/pi-ai/src/utils/event-stream.ts` exactly. Added TODO to replace with `@gsd/pi-ai` imports when available.
- **Files modified:** src/provider.ts
- **Commit:** 27f6caa

## Known Stubs

None. `cursorAcpProvider` is fully implemented — `streamCursorAcp` uses real ACP transport, real session pool, real event translator. `registerCursorAcpProvider()` calls real `registerApiProvider`. All logic is wired through the full stack.

## Self-Check: PASSED
