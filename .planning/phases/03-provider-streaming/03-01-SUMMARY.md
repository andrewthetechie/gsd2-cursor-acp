---
phase: 03-provider-streaming
plan: "01"
subsystem: event-translation
tags: [streaming, event-translator, session-pool, acp, gsd-2]
dependency_graph:
  requires: []
  provides:
    - AcpEventTranslator class (src/event-translator.ts)
    - sessionMode option on AcpSessionPoolOptions (src/session-pool.ts)
  affects:
    - src/session-pool.ts (sessionMode field and session/new mode param)
    - src/event-translator.ts (new file)
    - src/event-translator.test.ts (new file)
tech_stack:
  added: []
  patterns:
    - TDD (RED then GREEN) for AcpEventTranslator
    - Inline GSD-2 types (peer dep not installed; replace with @gsd/pi-ai imports when available)
    - partialSnapshot() pattern for immutable event partial fields
    - isDone guard for idempotent handleDone/handleAbort
key_files:
  created:
    - src/event-translator.ts
    - src/event-translator.test.ts
  modified:
    - src/session-pool.ts
    - src/session-pool.test.ts
decisions:
  - "Defined GSD-2 types inline in event-translator.ts because @gsd/pi-ai is a peer dep not installed in the project. Types match context/gsd-2/packages/pi-ai/src/types.ts exactly. Replace with real imports when package is available."
  - "ContentChunk.content is a ContentBlock (discriminated union), not a direct string. Text extracted via block.type === 'text' ? block.text : '' pattern."
  - "handleAbort() after handleDone() no-op confirmed by isDone guard."
metrics:
  duration: "3 min"
  completed_date: "2026-03-28"
  tasks_completed: 2
  files_changed: 4
---

# Phase 03 Plan 01: Event Translation Layer Summary

ACP session/update notification → GSD-2 AssistantMessageEvent translation layer with sessionMode support on AcpSessionPool.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add sessionMode to AcpSessionPool (D-15) | d730495 | src/session-pool.ts, src/session-pool.test.ts |
| 2 RED | AcpEventTranslator failing tests | c0b8ddd | src/event-translator.test.ts |
| 2 GREEN | AcpEventTranslator implementation | 917458f | src/event-translator.ts |

## What Was Built

### Task 1: sessionMode on AcpSessionPool

Added `sessionMode?: 'agent' | 'plan' | 'ask'` to `AcpSessionPoolOptions`. The pool stores `private readonly sessionMode` (default `'agent'`) and passes `mode: this.sessionMode` in every `session/new` request. This satisfies D-15 requirement that sessions use `agent` mode to receive tool notifications and thinking chunks.

### Task 2: AcpEventTranslator

New `src/event-translator.ts` with `AcpEventTranslator` class. It accepts an `AssistantMessageEventStream`, a model stub, and a `sessionId`, then:

- Emits `start` event in constructor
- `handleUpdate(SessionUpdate)`: routes `agent_message_chunk` → text events, `agent_thought_chunk` → thinking events, `tool_call` → toolcall_start, `tool_call_update` → toolcall_end; ignores all other update types
- Block transitions auto-close the previous block (text_end/thinking_end) before opening the next
- `handleDone()`: closes open block, maps ACP stop reason to GSD-2 StopReason, emits `done`, calls `stream.end()`
- `handleAbort()`: closes open block, emits `error` with `reason: 'aborted'`, calls `stream.end()`
- Both are guarded by `isDone` to be idempotent

## Verification

```
npm run typecheck  →  0 errors
npm test src/event-translator.test.ts  →  15/15 passed
npm test src/session-pool.test.ts  →  19/19 passed
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated session-pool.test.ts to include mode field in expected payload**
- **Found during:** Task 1 verification
- **Issue:** Existing test `getOrCreateSession calls session/new with cwd and returns sessionId` used `toEqual({ cwd: '/project', mcpServers: [] })` which no longer matched after adding `mode: this.sessionMode` to the request params
- **Fix:** Updated expected object to `{ cwd: '/project', mcpServers: [], mode: 'agent' }`
- **Files modified:** src/session-pool.test.ts
- **Commit:** d730495

**2. [Rule 2 - Missing critical functionality] Inline GSD-2 types**
- **Found during:** Task 2 implementation
- **Issue:** `@gsd/pi-ai` is declared as a peer dependency but not installed in node_modules. Direct `import type from '@gsd/pi-ai'` would fail typecheck.
- **Fix:** Defined required types inline in event-translator.ts with exact shapes matching context/gsd-2/packages/pi-ai/src/types.ts. Added TODO comment to replace with real imports when the package is available.
- **Files modified:** src/event-translator.ts

## Known Stubs

None. AcpEventTranslator is fully implemented with real translation logic. The `arguments: {}` for tool calls is intentional for Phase 3 (ACP Phase 3 does not parse rawInput into typed arguments).

## Self-Check: PASSED
