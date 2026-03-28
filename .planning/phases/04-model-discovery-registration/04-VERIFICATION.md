---
phase: 04-model-discovery-registration
verified: 2026-03-28T10:53:30Z
status: passed
score: 7/7 must-haves verified
re_verification: null
gaps: []
human_verification: []
---

# Phase 4: Model Discovery and Registration — Verification Report

**Phase Goal:** Dynamic model discovery and registration — consumers can call `await registerCursorAcpProvider()` to enumerate available Cursor models discovered via `cursor-agent --list-models`, namespaced as `cursor-acp/<id>`, with metadata from a static lookup table.
**Verified:** 2026-03-28T10:53:30Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `registerCursorAcpProvider()` is async and returns `Promise<void>` | VERIFIED | `src/register.ts` line 94: `export async function registerCursorAcpProvider(... ): Promise<void>` |
| 2 | Calling `registerCursorAcpProvider()` spawns `cursor-agent --list-models` and registers each discovered model with `cursor-acp/` prefix | VERIFIED | `discoverModelIds` calls `execFileAsync(binaryPath, ['--list-models'], ...)` (line 57); `_registeredModels = nativeIds.map(buildModel)` (line 99); `buildModel` prefixes `cursor-acp/` (model-metadata.ts line 67) |
| 3 | `getCursorAcpModels()` returns the list of registered `Model` objects after registration | VERIFIED | Exported from `src/register.ts` (line 18) and `src/index.ts` (line 8); returns module-level `_registeredModels` populated by `registerCursorAcpProvider` |
| 4 | Each registered model has `contextWindow`, `reasoning`, `maxTokens`, `input: ['text']`, and `cost: all zeros` | VERIFIED | `buildModel()` in model-metadata.ts: `input: ['text'] as const`, `cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }`, all three metadata fields set from static table or DEFAULT_META |
| 5 | Models not in the static table receive safe defaults (`contextWindow: 128000`, `reasoning: false`, `maxTokens: 8192`) | VERIFIED | `DEFAULT_META` (model-metadata.ts lines 30-34): `contextWindow: 128_000, reasoning: false, maxTokens: 8_192`; `buildModel` uses `?? DEFAULT_META` (line 65) |
| 6 | Discovery failure (non-zero exit, empty list, parse error) throws an `Error` — no fallback | VERIFIED | `discoverModelIds` throws `'cursor-agent model discovery failed: ...'` on `execFileAsync` rejection (line 68); throws `'produced no model IDs'` when parsed list is empty (lines 73-76) |
| 7 | Tests pass without spawning a real `cursor-agent` process (`vi.mock` on `node:child_process`) | VERIFIED | `src/register.test.ts` lines 27-29: `vi.mock('node:child_process', () => ({ execFile: mockExecFileFn }))` with `vi.hoisted()` setup; 100 tests pass without real binary |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/model-metadata.ts` | Static lookup table `CURSOR_MODEL_METADATA` + `DEFAULT_META` + `buildModel()` | VERIFIED | 79 lines; exports `CursorAcpModel`, `CursorModelMeta`, `DEFAULT_META`, `CURSOR_MODEL_METADATA`, `buildModel`; 15 model entries covering Claude, GPT, Gemini families |
| `src/register.ts` | Async `registerCursorAcpProvider` + `getCursorAcpModels` + `discoverModelIds` + `parseModelIds` | VERIFIED | 102 lines; all four functions exported; `async function registerCursorAcpProvider(...): Promise<void>`; imports from `node:child_process`, `./model-metadata.js`, `./types.js` |
| `src/index.ts` | Re-exports `getCursorAcpModels` | VERIFIED | Line 8: `export { registerCursorAcpProvider, getCursorAcpModels } from "./register.js"` |
| `src/register.test.ts` | Unit tests with mocked `node:child_process` covering MODL-01/02/03 | VERIFIED | 259 lines; 21 tests across 4 describe blocks: `parseModelIds`, `discoverModelIds`, `registerCursorAcpProvider`, `getCursorAcpModels`; `vi.mock('node:child_process')` present with `vi.hoisted()` pattern |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/register.ts` | `src/model-metadata.ts` | `import { buildModel } from './model-metadata.js'` | WIRED | Line 5: `import { buildModel, type CursorAcpModel } from './model-metadata.js'`; `buildModel` called at line 99 |
| `src/register.ts` | `node:child_process` | `execFile + promisify` for `cursor-agent --list-models` | WIRED | Line 1: `import { execFile } from 'node:child_process'`; line 8: `const execFileAsync = promisify(execFile)`; called at line 57 with `['--list-models']` |
| `src/index.ts` | `src/register.ts` | re-export `getCursorAcpModels` | WIRED | Line 8: `export { registerCursorAcpProvider, getCursorAcpModels } from "./register.js"` |

---

### Data-Flow Trace (Level 4)

`getCursorAcpModels()` returns module-level `_registeredModels`. Trace:

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/register.ts` — `getCursorAcpModels()` | `_registeredModels: CursorAcpModel[]` | `execFileAsync` → `parseModelIds` → `nativeIds.map(buildModel)` (line 99) | Yes — populated from CLI stdout parsed into model objects | FLOWING |

The data path is: real `cursor-agent` binary output (mocked in tests) → `parseModelIds(stdout)` → `nativeIds.map(buildModel)` → `_registeredModels` → `getCursorAcpModels()` return value. No hardcoded empty state returned in the success path.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `npm test` exits 0 — 100 tests pass | `npm test -- --reporter=dot` | 100 passed (100), 6 test files, 0 failures | PASS |
| TypeScript compiles without errors | `npx tsc --noEmit` | No output (exit 0) | PASS |
| `registerCursorAcpProvider` is async | `grep "export async function registerCursorAcpProvider" src/register.ts` | Match at line 94 | PASS |
| `getCursorAcpModels` exported from index | `grep "getCursorAcpModels" src/index.ts` | Match at line 8 | PASS |
| `cursor-acp/` prefix applied | `grep "cursor-acp/" src/register.test.ts` | Multiple matches | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MODL-01 | 04-01-PLAN.md | Provider discovers available models dynamically from Cursor CLI at startup | SATISFIED | `discoverModelIds()` spawns `cursor-agent --list-models`; called eagerly from `registerCursorAcpProvider()` before promise resolves |
| MODL-02 | 04-01-PLAN.md | Discovered models registered with metadata (context window, capabilities, cost) | SATISFIED | `buildModel()` attaches `contextWindow`, `reasoning`, `maxTokens` from `CURSOR_MODEL_METADATA`/`DEFAULT_META`; `cost` all zeros; `input: ['text']` |
| MODL-03 | 04-01-PLAN.md | Provider maps GSD-2 canonical model IDs and ThinkingLevel to Cursor model variants | SATISFIED | `cursor-acp/<nativeId>` namespace applied in `buildModel()`; `reasoning: true` flag set for known thinking models (claude-sonnet-4-5-thinking, claude-3-7-sonnet-thinking, gemini-2.5-pro, gemini-2.5-flash, claude-4-5-haiku-thinking) |

No orphaned requirements — MODL-01, MODL-02, MODL-03 are the only Phase 4 requirements in REQUIREMENTS.md, and all three are claimed and satisfied by 04-01-PLAN.md.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No TODO/FIXME/placeholder comments, no empty implementations, no hardcoded empty data returned in the success path, no stub handlers found in any Phase 4 modified files.

---

### Human Verification Required

None. All behavioral checks were verifiable programmatically. The phase produces no UI or visual output.

---

## Gaps Summary

No gaps. All 7 observable truths are verified. All 4 required artifacts exist, are substantive, wired, and have real data flowing through them. All 3 requirement IDs (MODL-01, MODL-02, MODL-03) are satisfied. The test suite passes (100/100) and TypeScript compiles clean.

One notable deviation from the plan occurred during implementation (documented in SUMMARY): the plan specified a simple `vi.mock` callback pattern, but the implementation required `vi.hoisted()` with `Symbol.for('nodejs.util.promisify.custom')` to correctly mock `promisify(execFile)`. The deviation was self-corrected by the executor and the result is more correct than the plan specified.

---

_Verified: 2026-03-28T10:53:30Z_
_Verifier: Claude (gsd-verifier)_
