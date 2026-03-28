---
phase: 04-model-discovery-registration
plan: "01"
subsystem: model-discovery
tags: [model-discovery, registration, async, child_process, vitest]
dependency_graph:
  requires: []
  provides: [model-metadata, async-registration, getCursorAcpModels]
  affects: [src/register.ts, src/index.ts, src/model-metadata.ts]
tech_stack:
  added: [node:child_process, promisify, vi.hoisted]
  patterns: [static-lookup-table, async-discovery, promisify-mock-pattern]
key_files:
  created:
    - src/model-metadata.ts
  modified:
    - src/register.ts
    - src/index.ts
    - src/register.test.ts
decisions:
  - "Used vi.hoisted() to define execFile mock with custom promisify symbol so promisify(execFile) returns { stdout, stderr } object form"
  - "Attached Symbol.for('nodejs.util.promisify.custom') to mock execFile to match Node.js runtime behavior"
  - "parseModelIds and discoverModelIds exported for direct unit testing"
metrics:
  duration: 5min
  completed_date: "2026-03-28T15:50:24Z"
  tasks: 2
  files: 4
requirements: [MODL-01, MODL-02, MODL-03]
---

# Phase 4 Plan 1: Model Discovery and Registration Summary

Dynamic model discovery via `cursor-agent --list-models` with async registration, static metadata lookup table, and comprehensive mocked tests using `vi.hoisted()` to avoid spawning real binaries.

## What Was Built

### src/model-metadata.ts (new)
Static lookup table `CURSOR_MODEL_METADATA` covering Claude, GPT, and Gemini families with contextWindow, reasoning, and maxTokens per model. `DEFAULT_META` provides safe defaults (128k context, no reasoning, 8192 tokens) for unknown models. `buildModel(nativeId)` constructs a `CursorAcpModel` with `cursor-acp/` prefix, zero cost, and `['text']` input.

### src/register.ts (rewritten)
Breaking change: `registerCursorAcpProvider()` is now `async` and returns `Promise<void>`. New exports:
- `parseModelIds(stdout)` - filters header/footer lines, extracts first token per model line
- `discoverModelIds(binaryPath)` - spawns `cursor-agent --list-models` via `promisify(execFile)` with 15s timeout, NO_COLOR=1, FORCE_COLOR=0; throws on failure
- `getCursorAcpModels()` - returns module-level `_registeredModels` array ([] before registration)

### src/index.ts (updated)
Added `getCursorAcpModels` to re-exports from register.ts.

### src/register.test.ts (extended)
Full test suite with `vi.hoisted()` mock of `node:child_process` covering:
- `parseModelIds` - 6 tests (header skip, footer skip, token extraction)
- `discoverModelIds` - 5 tests (call args, env vars, timeout, error propagation)
- `registerCursorAcpProvider` - 3 tests (async, registry, provider shape)
- `getCursorAcpModels` - 7 tests (prefix, known model metadata, defaults, input/cost, baseUrl)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed promisify mock to return {stdout, stderr} object form**
- **Found during:** Task 2 (GREEN phase) - all tests calling `discoverModelIds` failed with "Cannot read properties of undefined (reading 'split')"
- **Issue:** `promisify(execFile)` uses Node.js's custom promisify symbol (`Symbol.for('nodejs.util.promisify.custom')`) to return `{ stdout, stderr }`. The plain `vi.fn()` mock had no custom symbol, so promisify fell back to standard behavior that resolves with just the first argument (stdout string, not object). `result.stdout` was `undefined`.
- **Fix:** Used `vi.hoisted()` to create the mock with `Symbol.for('nodejs.util.promisify.custom')` attached as a separate `vi.fn()`. Mock assertions check the custom promisify function's call args rather than the raw `execFile` mock.
- **Files modified:** src/register.test.ts
- **Commit:** 4a60007

**2. [Rule 3 - Blocking] Moved mock variable definition to vi.hoisted() to avoid hoisting TDZ error**
- **Found during:** Task 2, first attempt - vi.mock factory ran before `mockExecFileFn` was initialized
- **Issue:** vi.mock() is hoisted to top of file, but variable declarations are not. The factory function referenced `mockExecFileFn` which hadn't been initialized yet (TDZ error).
- **Fix:** Wrapped mock setup in `vi.hoisted()` so it runs before the hoisted vi.mock() factory.
- **Files modified:** src/register.test.ts
- **Commit:** 4a60007

## Decisions Made

1. Used `vi.hoisted()` pattern with `Symbol.for('nodejs.util.promisify.custom')` to correctly mock `promisify(execFile)` - this is the canonical pattern for mocking Node.js promisified builtins in Vitest.

2. Exported `parseModelIds` and `discoverModelIds` for direct unit testing, enabling precise behavior verification without going through the full registration flow.

## Known Stubs

None - all data flows are wired. `getCursorAcpModels()` returns real discovered models after `registerCursorAcpProvider()` resolves.

## Verification

- `npm test`: 100 tests passed (0 failed)
- `npx tsc --noEmit`: 0 errors
- `grep "export async function registerCursorAcpProvider" src/register.ts`: match found (line 94)
- `grep "getCursorAcpModels" src/index.ts`: match found (line 8)
- `grep "cursor-acp/" src/register.test.ts`: multiple matches found

## Self-Check: PASSED

Files created/modified:
- FOUND: src/model-metadata.ts
- FOUND: src/register.ts
- FOUND: src/index.ts
- FOUND: src/register.test.ts

Commits:
- FOUND: a2e6ba7 (feat(04-01): implement model-metadata.ts and async register.ts with discovery)
- FOUND: 4a60007 (test(04-01): extend register.test.ts with mocked child_process discovery tests)
