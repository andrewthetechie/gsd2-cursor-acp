# Phase 4: Model Discovery & Registration - Research

**Researched:** 2026-03-28
**Domain:** Node.js child_process, cursor-agent CLI discovery, GSD-2 model registration, TypeScript async lifecycle
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Discovery Mechanism**
- D-01: Use `cursor-agent models` (or equivalent subcommand) to discover available models. Run as a child process invocation separate from the ACP stdio session.
- D-02: If discovery fails for any reason, throw an error. No fallback to static list — failure is hard-fatal.

**Model Metadata Strategy**
- D-03: Ship a static lookup table keyed on Cursor model ID mapping to: `contextWindow`, `reasoning`, `maxTokens`. Cost fields all zero.
- D-04: Models not in the static table get safe defaults: `contextWindow: 128000`, `reasoning: false`, `maxTokens: 8192`, cost all zero.
- D-05: `input` capability is always `["text"]`.

**Model ID & Naming**
- D-06: Prefix all discovered model IDs with `cursor-acp/` when registering (e.g. `cursor-acp/claude-sonnet-4-5`).
- D-07: The native Cursor model ID (without prefix) is used in ACP `session/new` and `session/prompt` calls. Strip `cursor-acp/` before sending to ACP.

**ThinkingLevel Handling**
- D-08: ThinkingLevel is silently ignored. Cursor controls thinking internally per model.

**Discovery Timing & Lifecycle**
- D-09: `registerCursorAcpProvider()` becomes `async` — returns `Promise<void>`. Breaking change to Phase 3 signature.
- D-10: Discovery runs eagerly inside `registerCursorAcpProvider()` — no lazy deferral.
- D-11: No disk caching. Discovery runs fresh every `registerCursorAcpProvider()` call.

### Claude's Discretion

- How to invoke `cursor-agent models` — exact subcommand syntax, arg parsing, output format parsing. Planner should check actual cursor-agent CLI help, otherwise make a reasonable assumption and document it.
- Where to define the static metadata lookup table — inline in `register.ts` or a new `src/model-metadata.ts` file.
- What GSD-2 model registry function to call to register discovered models — check `context/gsd-2/packages/pi-ai/src/models.ts`.

### Deferred Ideas (OUT OF SCOPE)

- Disk caching of discovered models with TTL.
- ThinkingLevel → session mode mapping.
- Canonical ID aliasing (e.g. GSD-2's `claude-sonnet-4-6` → Cursor's `claude-sonnet-4-5`).
- Session-mode-per-model.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MODL-01 | Provider discovers available models dynamically from Cursor CLI at startup | D-01/D-02: spawn `cursor-agent --list-models`, parse stdout; D-09/D-10: async eager discovery in registerCursorAcpProvider() |
| MODL-02 | Discovered models registered with metadata (context window, capabilities, cost) | D-03/D-04: static lookup table + safe defaults; Model<"cursor-acp"> interface from provider.ts lines 188-199 |
| MODL-03 | Provider maps GSD-2 canonical model IDs and ThinkingLevel to Cursor model variants | D-06/D-07: cursor-acp/ prefix namespace; D-08: ThinkingLevel silently ignored; streamCursorAcp strips prefix before ACP calls |
</phase_requirements>

---

## Summary

Phase 4 makes `registerCursorAcpProvider()` async and adds model discovery by spawning the `cursor-agent` binary as a child process (separate from the ACP session) to retrieve the list of models available for the current account. Discovered models are registered in GSD-2's provider registry with the `cursor-acp/` namespace prefix and metadata from a static lookup table.

**Critical discovery from binary inspection:** The `cursor-agent models` subcommand and the `--list-models` flag both render output via Ink/React to a terminal UI — they do NOT produce JSON stdout. However, when spawned with `NO_COLOR=1` and `FORCE_COLOR=0` and piped stdout (non-TTY), Ink outputs plain text without ANSI escape codes. The output format is parseable plain text with one model ID per line. The `cursor-agent --list-models` flag is the correct invocation — it is on the root command (not the `agent` subcommand), and exits after printing.

**Primary recommendation:** Spawn `cursor-agent --list-models` via `execFile` with `NO_COLOR=1` and `FORCE_COLOR=0` env vars, capture stdout as plain text, parse model IDs from the Ink-rendered output lines, then register each as `cursor-acp/<model_id>` using the existing `registerApiProvider()` + inline model array.

---

## Standard Stack

### Core (already installed — no new packages needed)

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| Node.js `child_process` | built-in | Spawn `cursor-agent --list-models` subprocess | Use `execFile`, not `exec` |
| `vitest` | 3.2.4 | Unit tests for async register and model assertions | Already in devDependencies |
| TypeScript | 5.7.x | Async function signatures, type-safe model objects | Already configured |

**No new npm packages required.**

### Supporting

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| `@agentclientprotocol/sdk` | ^0.17.0 | Already present — no role in discovery | Not used in Phase 4 |

---

## Architecture Patterns

### Recommended File Changes

```
src/
├── register.ts          # Main change: make async, add discovery logic
├── model-metadata.ts    # NEW: static lookup table (Claude discretion: extract here)
├── provider.ts          # Minor: strip cursor-acp/ prefix before ACP calls
├── index.ts             # Update export type: Promise<void> return
└── register.test.ts     # Extend: async registration, model assertions
```

### Pattern 1: async registerCursorAcpProvider()

**What:** Convert from `function registerCursorAcpProvider(): void` to `async function registerCursorAcpProvider(): Promise<void>`. Discovery runs eagerly before the function resolves.

**Key structure:**

```typescript
// src/register.ts
export async function registerCursorAcpProvider(
  options?: { binaryPath?: string }
): Promise<void> {
  const binary = options?.binaryPath ?? DEFAULT_TRANSPORT_OPTIONS.binaryPath;
  const rawIds = await discoverModelIds(binary);       // spawn + parse
  const models = rawIds.map(id => buildModel(id));     // static table lookup
  registerApiProvider({ api: 'cursor-acp', stream, streamSimple, models });
}
```

### Pattern 2: execFile for Discovery Subprocess

**What:** Use `child_process.execFile` (not `exec`) with controlled environment to suppress ANSI codes. Non-TTY piped stdout means Ink renders plain text.

**Critical env vars:**
- `NO_COLOR=1` — suppresses ANSI color codes
- `FORCE_COLOR=0` — belt-and-suspenders
- `CI=1` — optional additional signal to suppress interactive UI

**Timeout:** Discovery is a network call (gRPC to Cursor backend). Apply a reasonable timeout (e.g. 15 seconds) to avoid hanging startup.

```typescript
// Source: Node.js built-in child_process docs + cursor-agent binary inspection
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function discoverModelIds(binaryPath: string): Promise<string[]> {
  const { stdout } = await execFileAsync(
    binaryPath,
    ['--list-models'],
    {
      timeout: 15_000,
      env: {
        ...process.env,
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
    }
  );
  return parseModelIds(stdout);
}
```

### Pattern 3: Output Parsing (Ink plain-text format)

**What the output looks like** (verified from `78.index.js` component `m`):

When Ink runs in non-TTY mode with `NO_COLOR=1`, the component renders:
```
Available models

claude-sonnet-4-5 - Claude Sonnet 4.5
gpt-4o - GPT-4o
gemini-2.5-pro - Gemini 2.5 Pro
...

Tip: use --model <id> (or /model <id> in interactive mode) to switch.
```

Each model line format: `<displayModelId> [- <displayName>] [(current)] [(default)]`

**Model ID extraction:** The model ID (used in ACP calls) is the first whitespace-delimited token on each model line. Lines to skip: empty, "Available models", lines starting with "Tip:".

The `displayModelId` (or `modelId` if no displayModelId) is what gets sent to ACP. This matches D-07.

```typescript
function parseModelIds(stdout: string): string[] {
  const lines = stdout.split('\n');
  const ids: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('Available models')) continue;
    if (trimmed.startsWith('Tip:')) continue;
    if (trimmed.startsWith('No models available')) continue;
    // First token is the model ID
    const id = trimmed.split(/\s/)[0];
    if (id) ids.push(id);
  }
  return ids;
}
```

**Confidence: MEDIUM** — Based on Ink component source code inspection. The exact output format when non-TTY depends on Ink's rendering behavior when `stdout.isTTY` is false. Should be validated against actual CLI output during implementation (see Open Questions #1).

### Pattern 4: Static Metadata Lookup Table

**What:** A Record keyed on native Cursor model IDs (no prefix). Used to fill in GSD-2 `Model<"cursor-acp">` metadata fields. Models not in the table fall back to D-04 defaults.

**Key insight from binary inspection:** `ModelDetails` proto has `thinking_details` and `max_mode` fields (bool), which hint at which models support extended thinking. Use this to set `reasoning: true` in the static table for Claude thinking models.

**Known Cursor models (from binary + common knowledge):**

```typescript
// src/model-metadata.ts
interface CursorModelMeta {
  contextWindow: number;
  reasoning: boolean;
  maxTokens: number;
}

const DEFAULT_META: CursorModelMeta = {
  contextWindow: 128_000,
  reasoning: false,
  maxTokens: 8_192,
};

export const CURSOR_MODEL_METADATA: Record<string, CursorModelMeta> = {
  // Claude family
  'claude-sonnet-4-5':          { contextWindow: 200_000, reasoning: false, maxTokens: 8_192 },
  'claude-sonnet-4-5-thinking':  { contextWindow: 200_000, reasoning: true,  maxTokens: 16_000 },
  'claude-opus-4':              { contextWindow: 200_000, reasoning: false, maxTokens: 32_000 },
  'claude-opus-4-5':            { contextWindow: 200_000, reasoning: false, maxTokens: 32_000 },
  'claude-3-5-sonnet':          { contextWindow: 200_000, reasoning: false, maxTokens: 8_192 },
  'claude-3-7-sonnet':          { contextWindow: 200_000, reasoning: false, maxTokens: 64_000 },
  'claude-3-7-sonnet-thinking': { contextWindow: 200_000, reasoning: true,  maxTokens: 64_000 },
  'claude-4-5-haiku':           { contextWindow: 200_000, reasoning: false, maxTokens: 8_192 },
  'claude-4-5-haiku-thinking':  { contextWindow: 200_000, reasoning: true,  maxTokens: 8_192 },
  // GPT family
  'gpt-4o':                     { contextWindow: 128_000, reasoning: false, maxTokens: 16_384 },
  'gpt-4o-mini':                { contextWindow: 128_000, reasoning: false, maxTokens: 16_384 },
  'gpt-5':                      { contextWindow: 128_000, reasoning: false, maxTokens: 32_000 },
  // Gemini family
  'gemini-2.5-pro':             { contextWindow: 1_000_000, reasoning: true, maxTokens: 65_536 },
  'gemini-2.5-flash':           { contextWindow: 1_000_000, reasoning: true, maxTokens: 65_536 },
  'gemini-2.0-flash':           { contextWindow: 1_048_576, reasoning: false, maxTokens: 8_192 },
};
```

**Note:** Exact values are LOW confidence and should be treated as best-effort. D-04 says unknown models get safe defaults — the table only needs to cover common models.

### Pattern 5: Model Object Construction

**What:** Build a `Model` object conforming to the inline interface in `src/provider.ts` (lines 188-199) for each discovered model.

```typescript
function buildModel(nativeId: string): Model {
  const meta = CURSOR_MODEL_METADATA[nativeId] ?? DEFAULT_META;
  return {
    id: `cursor-acp/${nativeId}`,      // D-06: prefixed ID
    name: nativeId,                    // human-readable; could be displayName if parsed
    api: 'cursor-acp' as const,
    provider: 'cursor-acp',
    baseUrl: '',                       // ACP uses stdio, no HTTP URL
    reasoning: meta.reasoning,
    input: ['text'] as const,          // D-05: always text-only
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },  // D-03: subscription
    contextWindow: meta.contextWindow,
    maxTokens: meta.maxTokens,
  };
}
```

### Pattern 6: Provider ID Stripping in streamCursorAcp

**What:** When ACP calls pass `session/new`, the model ID must NOT have the `cursor-acp/` prefix. Currently `streamCursorAcp` does not construct the model ID for ACP — it just calls `pool.getOrCreateSession`. The model ID is only used for error messages and stream metadata today.

**D-07 implication:** When Phase 4 models are actually used in ACP `session/new` calls, the prefix must be stripped. However, looking at the current `provider.ts`, `session/new` does NOT currently pass a model ID to ACP — it only passes `cwd` and `mcpServers`. The session just uses whatever model the user has configured in Cursor.

**Decision required (Claude's discretion):** Should `session/new` pass a `model` parameter? The ACP protocol's `session/new` shape was not documented in `cursor_acp.md` with a model field. Based on the binary inspection, `RequestedModel` has `modelId` and `maxMode` fields. The planner should check whether passing a model to `session/new` is supported/needed.

**For Phase 4:** Strip `cursor-acp/` prefix when (if) a model ID is passed to ACP. Defensive implementation:

```typescript
const nativeModelId = model.id.startsWith('cursor-acp/')
  ? model.id.slice('cursor-acp/'.length)
  : model.id;
```

### Anti-Patterns to Avoid

- **Parsing JSON from `cursor-agent models`:** The command has no `--json` flag. Output is Ink TUI text.
- **Using `exec` instead of `execFile`:** `execFile` is safer (no shell injection), more predictable.
- **Setting `shell: true`:** Not needed; binary path is from config, not user input.
- **Forgetting timeout:** Discovery makes a network call; no timeout = infinite hang at startup.
- **Not cleaning up on discovery failure:** If `execFile` throws, let it propagate — D-02 says discovery failure is hard-fatal.
- **Mutating `process.env` directly:** Pass `env` option to `execFile` instead.
- **Using `spawn` with streaming:** `execFile` is simpler and sufficient — output is small (model list, not streaming).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ANSI stripping | Custom regex ANSI stripper | Set `NO_COLOR=1` env var | Ink respects `NO_COLOR` — suppresses at source |
| Async mutex for init | Custom lock mechanism | Simple `await` on `registerCursorAcpProvider()` (D-10 eager) | D-10/D-11 already dictate no caching/lazy init needed |
| Model ID validation | Custom regex/allowlist | Trust list from CLI + static table fallback (D-04) | Unknown models get safe defaults per spec |
| HTTP model lookup | Call Cursor API directly | Use CLI subprocess | ACP is the integration surface; no direct API access |

---

## Common Pitfalls

### Pitfall 1: Ink Non-TTY Output Format Uncertainty

**What goes wrong:** Ink's behavior when `stdout.isTTY` is false is not officially documented. The plain-text output format inferred from source may differ from actual behavior.
**Why it happens:** Ink was designed for TTY output; non-TTY mode is a secondary path.
**How to avoid:** During implementation, add a quick manual test: run `cursor-agent --list-models 2>/dev/null | cat` and verify format matches the parser. If parsing fails, fall back to regex matching model-ID-like tokens.
**Warning signs:** `parseModelIds()` returns empty array despite non-empty stdout.

### Pitfall 2: Discovery Hangs on Network Timeout

**What goes wrong:** `cursor-agent --list-models` calls the Cursor backend (gRPC) to get the model list. If the user has network issues or the Cursor service is slow, startup hangs.
**Why it happens:** `getUsableModels` is a remote RPC call (observed in `78.index.js`).
**How to avoid:** Pass `timeout: 15_000` to `execFile`. The cursor-agent binary itself has a 2-second internal timeout for the parameterized models fetch; the full models fetch may take longer.
**Warning signs:** `registerCursorAcpProvider()` never resolves in integration tests.

### Pitfall 3: Keychain Lock on macOS During Tests

**What goes wrong:** `cursor-agent` requires access to the macOS keychain for authentication. In CI or locked sessions, the command fails with `Error: Your macOS login keychain is locked.`
**Why it happens:** Observed directly — running `cursor-agent --list-models` without keychain access fails immediately.
**How to avoid:** Unit tests MUST mock the child process spawn. Do not run actual `cursor-agent` in unit tests. For integration tests, require a pre-authenticated environment.
**Warning signs:** `execFile` rejects with "keychain is locked" message.

### Pitfall 4: Cursor CLI vs cursor-agent Binary Name

**What goes wrong:** The CLI binary may be invoked as `agent` (short alias) or `cursor-agent`. On this machine, both are symlinks to the same binary. `TransportOptions.binaryPath` defaults to `"cursor-agent"`.
**Why it happens:** Users may have only one alias in PATH.
**How to avoid:** Use the same `binaryPath` as the ACP transport — already handled by D-01 ("reuse the same binaryPath convention"). Test with default `"cursor-agent"` and let users override via `binaryPath` option.

### Pitfall 5: async registerCursorAcpProvider() — Breaking Change

**What goes wrong:** Phase 3 consumers call `registerCursorAcpProvider()` without `await`, expecting synchronous behavior. After Phase 4, models are not registered until the promise resolves.
**Why it happens:** D-09 requires the signature change.
**How to avoid:** Update `src/index.ts` to export the new async signature. Update `src/register.test.ts` to use `await`. Document the breaking change in the function JSDoc.

### Pitfall 6: Model ID Mismatch Between Discovery and ACP

**What goes wrong:** The `displayModelId` shown by `cursor-agent --list-models` may differ from the `modelId` used in ACP calls. The component renders `displayModelId || modelId` — discovery must capture the correct ID for ACP use.
**Why it happens:** Cursor has both a display ID and a canonical model ID. The ACP `session/new` request uses `modelId`, not `displayModelId`.
**How to avoid:** The parser captures the first whitespace token per line, which is `displayModelId || modelId` from the Ink component. This is likely the ACP-usable ID. Validate during integration testing.

---

## Code Examples

### Child Process Discovery (Verified Pattern)

```typescript
// Source: Node.js built-in docs — execFile + promisify
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function discoverCursorModels(
  binaryPath: string,
): Promise<string[]> {
  let stdout: string;
  try {
    const result = await execFileAsync(binaryPath, ['--list-models'], {
      timeout: 15_000,
      env: {
        ...process.env,
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
    });
    stdout = result.stdout;
  } catch (err) {
    // D-02: discovery failure is hard-fatal
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`cursor-agent model discovery failed: ${msg}`);
  }

  const ids = parseModelIds(stdout);
  if (ids.length === 0) {
    throw new Error(
      `cursor-agent --list-models produced no model IDs. stdout: ${stdout.slice(0, 200)}`,
    );
  }
  return ids;
}
```

### Async registerCursorAcpProvider (Updated Signature)

```typescript
// src/register.ts — Phase 4 version
import { registerApiProvider } from './api-registry.js';
import { cursorAcpProvider } from './provider.js';
import { discoverCursorModels } from './model-discovery.js';  // or inline
import { buildModelList } from './model-metadata.js';          // or inline
import { DEFAULT_TRANSPORT_OPTIONS } from './types.js';

export async function registerCursorAcpProvider(options?: {
  binaryPath?: string;
}): Promise<void> {
  const binaryPath = options?.binaryPath ?? DEFAULT_TRANSPORT_OPTIONS.binaryPath;
  const nativeIds = await discoverCursorModels(binaryPath);
  const models = buildModelList(nativeIds);
  // registerApiProvider already wired — models stored alongside provider
  // (see Open Questions #2 for how GSD-2 registry accepts model list)
  registerApiProvider(cursorAcpProvider as any);
  // Also register each model so GSD-2 can look them up by id
  // Pattern: store models on provider or in a module-level map
}
```

### Extending register.test.ts

```typescript
// src/register.test.ts — Phase 4 additions
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock child_process at module level
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

describe('registerCursorAcpProvider (Phase 4)', () => {
  it('is async and returns Promise<void>', async () => {
    // mock execFile to return model list
    const result = await registerCursorAcpProvider();
    expect(result).toBeUndefined(); // void
  });

  it('registers provider with discovered models', async () => {
    // mock execFile to emit: "Available models\nclaude-sonnet-4-5 - Sonnet\ngpt-4o - GPT-4o\n"
    await registerCursorAcpProvider();
    // assert models in registry
  });

  it('throws if cursor-agent binary fails', async () => {
    // mock execFile to reject
    await expect(registerCursorAcpProvider()).rejects.toThrow('model discovery failed');
  });
});
```

---

## GSD-2 Registry Integration

This section addresses the Claude's Discretion item about which GSD-2 function to call.

**Finding:** `context/gsd-2/packages/pi-ai/src/models.ts` does NOT expose an `addModel()` or `registerModel()` function. The registry is initialized at module load from static `MODELS` and `CUSTOM_MODELS`. There is no runtime insertion API.

**Implication:** The `cursor-acp` models cannot be stored in GSD-2's `modelRegistry` map directly. Instead, the `cursor-acp` provider must manage its own model list. The `registerApiProvider()` interface only registers the stream functions — it does not accept a model list.

**Recommended approach (Claude's discretion resolved):** Store discovered models in a module-level variable in `register.ts` or `provider.ts`. Export a `getCursorAcpModels(): Model[]` function for callers that need to enumerate them. GSD-2 code that wants to list available models calls `getCursorAcpModels()` after `await registerCursorAcpProvider()`.

```typescript
// Module-level in register.ts
let _registeredModels: Model[] = [];

export function getCursorAcpModels(): Model[] {
  return _registeredModels;
}

export async function registerCursorAcpProvider(options?: { binaryPath?: string }): Promise<void> {
  // ... discovery ...
  _registeredModels = buildModelList(nativeIds);
  registerApiProvider(cursorAcpProvider as any);
}
```

This mirrors the pattern used by GSD-2's `getModels(provider)` function conceptually.

---

## cursor-agent CLI Facts (from Binary Inspection)

**Confidence: HIGH** — All findings verified from `/Users/aherrington/.local/share/cursor-agent/versions/2026.03.11-6dfa30c/` source.

| Fact | Value | Source |
|------|-------|--------|
| Binary version | 2026.03.11-6dfa30c | filesystem |
| Models subcommand | `cursor-agent models` — separate subcommand | `y.command("models")` at 6267120 |
| List models flag | `cursor-agent --list-models` — root command flag | `.option("--list-models", ...)` |
| `--list-models` behavior | Calls `handleModelsList` then `process.exit(0)` | `78.index.js` |
| Output format | Ink/React TUI, plain text when non-TTY | `78.index.js` component `m` |
| Model ID field used in display | `displayModelId || modelId` | component `m`, line `e.displayModelId||e.modelId||""` |
| ModelDetails fields | `model_id`, `display_model_id`, `display_name`, `display_name_short`, `aliases`, `thinking_details`, `max_mode` | `agent.v1.ModelDetails` proto |
| Backend call | `getUsableModels` gRPC | `model-service.ts` in bundle |
| ANSI suppression | `NO_COLOR=1` respected | `commander` and `chalk` checks in bundle |

**Both `cursor-agent models` and `cursor-agent --list-models` work.** Using `--list-models` (root flag) is slightly simpler since it exits after listing. The `models` subcommand does the same thing. CONTEXT.md D-01 says "cursor-agent models (or equivalent subcommand)" — the flag `--list-models` is the cleaner interface.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- --reporter=dot` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MODL-01 | `discoverCursorModels()` calls execFile with correct args + env | unit | `npm test -- --reporter=dot src/register.test.ts` | exists (extend) |
| MODL-01 | Hard-fatal: throws on non-zero exit / parse failure | unit | same | exists (extend) |
| MODL-02 | Models registered with contextWindow/reasoning/maxTokens metadata | unit | same | exists (extend) |
| MODL-02 | Unknown models get safe defaults (D-04) | unit | same | exists (extend) |
| MODL-03 | Model IDs registered with `cursor-acp/` prefix | unit | same | exists (extend) |
| MODL-03 | `getCursorAcpModels()` returns registered model list | unit | same | exists (extend) |
| MODL-03 | ThinkingLevel options silently ignored (existing Phase 3 test) | unit | same | exists |

### Sampling Rate

- **Per task commit:** `npm test -- --reporter=dot`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

None — existing `src/register.test.ts` provides the test file. Tests need extending, not creating. `vi.mock('node:child_process')` needs to be added to the file.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| cursor-agent binary | MODL-01 discovery | ✓ | 2026.03.11-6dfa30c | — |
| Node.js | Runtime | ✓ | v24.13.1 | — |
| vitest | Tests | ✓ | 3.2.4 | — |
| Cursor keychain auth | Integration test only | Locked (macOS keychain locked) | — | Unit tests mock execFile |

**Missing dependencies with no fallback:** None blocking for unit-test-covered implementation.

**Integration testing note:** Running actual `cursor-agent --list-models` requires the macOS keychain to be unlocked and the user to be authenticated with Cursor. Unit tests must mock `execFile` entirely. Integration tests are explicitly out of scope for Phase 4 (Phase 5 covers TEST-02).

---

## Open Questions

1. **Exact Ink non-TTY output format**
   - What we know: The Ink component renders `displayModelId - displayName (current/default)` per model; `NO_COLOR=1` suppresses ANSI codes
   - What's unclear: Does Ink write to stdout or stderr in non-TTY mode? Does it add extra whitespace, indentation, or Box borders?
   - Recommendation: During implementation, test with `cursor-agent --list-models 2>/dev/null | cat` (after unlocking keychain). Make the parser defensive: skip non-model lines by checking if the first token looks like a model ID pattern (contains letters, numbers, hyphens/dots, no spaces).

2. **Does session/new accept a model parameter?**
   - What we know: `RequestedModel` proto has `model_id` and `max_mode` fields (from binary). The ACP `session/new` documented shape does not mention model selection.
   - What's unclear: Whether passing a model to `session/new` routes to a specific model or is ignored.
   - Recommendation: For Phase 4, do NOT add model routing to `session/new`. The prefix-stripping logic (D-07) is implemented but not wired to ACP calls until this is confirmed. GSD-2 callers select models by choosing the `cursor-acp/<id>` model object — Cursor uses the account's configured model.

3. **How does GSD-2 caller look up cursor-acp models by ID?**
   - What we know: GSD-2's `modelRegistry` does not have a runtime insertion API. `registerApiProvider()` only registers stream functions.
   - What's unclear: Whether GSD-2 has a separate model listing API that the cursor-acp provider should integrate with.
   - Recommendation: Expose `getCursorAcpModels()` from `src/register.ts` as the model enumeration API. This is sufficient for Phase 4 — MODL-01/02/03 say "registered with metadata" but don't specify the exact registry mechanism.

---

## Sources

### Primary (HIGH confidence)

- cursor-agent binary `78.index.js` — `handleModelsList`, `model-service.ts`, `model-utils.ts` (direct source inspection)
- cursor-agent binary `index.js` — command structure, `--list-models` flag, `models` subcommand, `ModelDetails` proto fields
- `context/gsd-2/packages/pi-ai/src/models.ts` — registry structure, no runtime insertion API
- `context/gsd-2/packages/pi-ai/src/types.ts` — `Model<TApi>` interface, `ThinkingLevel` type
- `context/gsd-2/packages/pi-ai/src/api-registry.ts` — `registerApiProvider()` interface
- `src/provider.ts` lines 188-199 — inline `Model` interface shape
- `src/register.ts` — current synchronous implementation to be converted
- `src/types.ts` — `TransportOptions.binaryPath` default

### Secondary (MEDIUM confidence)

- Node.js `child_process.execFile` + `promisify` docs (standard Node.js built-in, stable)
- Chalk/commander `NO_COLOR` support — inferred from bundle code patterns

### Tertiary (LOW confidence)

- Ink non-TTY rendering behavior — inferred from component source, unvalidated against live output
- Static model metadata values (contextWindow, maxTokens per model) — best-effort; D-04 safe defaults apply to unknowns

---

## Metadata

**Confidence breakdown:**
- CLI invocation (`cursor-agent --list-models`): HIGH — verified from binary
- Output format: MEDIUM — inferred from Ink component source, needs live validation
- GSD-2 registry integration: HIGH — verified from models.ts (no addModel API)
- Static metadata table values: LOW — training-data based, safe defaults cover unknowns per D-04
- Test patterns: HIGH — existing vitest infrastructure, vi.mock is standard

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (cursor-agent binary version may update; recheck if > 30 days old)
