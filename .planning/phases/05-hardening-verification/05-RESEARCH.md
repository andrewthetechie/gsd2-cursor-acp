# Phase 5: Hardening & Verification - Research

**Researched:** 2026-03-28
**Domain:** TypeScript error handling, Vitest integration testing, subprocess mocking, TSDoc
**Confidence:** HIGH

## Summary

Phase 5 is a hardening phase for a complete, working package. All six requirements (ERRH-01/02/03, TEST-01/02/03) are tightly scoped and well-decided in CONTEXT.md. The codebase already has a mature test suite (100 tests passing across six test files), a clear error hierarchy in `src/errors.ts`, and a known mocking pattern for subprocess calls established in Phase 4's `register.test.ts`.

The work divides into three tracks that can be planned in parallel: (1) three new typed error classes in `errors.ts` plus integration at their call sites, (2) an integration test file that spawns a real mock ACP subprocess, and (3) documentation artifacts (README.md, TSDoc comments, TESTING.md). The error class changes are small and surgical; the integration test is the highest-complexity item because it requires writing a small Node.js mock ACP server script.

The primary technical risk is the mock ACP server for integration tests. The existing `transport.test.ts` validates the stdio/JSON-RPC communication layer works with mocked streams; the integration test needs to go one level higher and use an actual child process. The pattern to follow is well-established in Node.js testing: a `src/__fixtures__/mock-acp-server.ts` (or `.mjs`) file that speaks JSON-RPC over stdio, driven by command-line arguments to select which scenario to run.

**Primary recommendation:** Implement in three clean tasks — errors, integration tests, docs — with the mock ACP server fixture as the most detail-sensitive artifact.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**CLI Detection (ERRH-01)**
- D-01: `registerCursorAcpProvider()` performs an upfront binary check (e.g. `execFile cursor-agent --version`) before proceeding. If the binary is not found, it throws `CursorCliNotFoundError` immediately — callers get a clear error at startup, not buried in the first `stream()` call.
- D-02: Error message on CLI not found must be actionable: "cursor-agent not found. Install Cursor from https://cursor.com and ensure cursor-agent is on your PATH, then run `cursor-agent login`."

**Error Classes (ERRH-01, ERRH-02, ERRH-03)**
- D-03: Add three new typed error classes to `src/errors.ts`, all extending `TransportError`:
  - `CursorCliNotFoundError` — binary not on PATH (ERRH-01)
  - `CursorAuthError` — authentication expired or missing (ERRH-02); replaces current plain `Error` throw in `session-pool.ts`
  - `CursorSessionError` — session/new or session/prompt failures (ERRH-03)
- D-04: `CursorAuthError` must include the original error cause so callers can inspect it.
- D-05: `CursorSessionError` maps to a GSD-2 `error` event via the existing provider catch block — the error type is preserved in the message, stream still ends cleanly.

**E2E / Integration Test Strategy (TEST-02)**
- D-06: TEST-02 is satisfied by mocked subprocess integration tests — a real Node.js child process that speaks ACP protocol (JSON-RPC over stdio) acts as a fixture, not actual Cursor.
- D-07: Integration test suite covers all four paths: (1) full stream happy path, (2) auth failure path with `CursorAuthError`, (3) session/prompt error path with `CursorSessionError` mapped to GSD-2 `error` event, (4) CLI not found path with `CursorCliNotFoundError` thrown.

**Documentation (TEST-03)**
- D-08: Produce three documentation artifacts:
  1. `README.md` — installation, configuration, usage example
  2. TSDoc/JSDoc on all public exports
  3. `TESTING.md` — how to run tests, what each file covers, manual smoke-test steps

### Claude's Discretion

- Exact binary detection mechanism — `execFile --version`, `which`, or `accessSync` check. Use whatever is most reliable cross-platform for detecting a missing binary.
- Where the mock ACP server fixture lives — `src/__fixtures__/` or a `test/` top-level directory. Follow existing test file placement patterns.
- Whether `CursorSessionError` wraps both session/new and session/prompt errors, or has subclasses for each. Keep simple unless there's a clear reason to distinguish.

### Deferred Ideas (OUT OF SCOPE)

- Contributing docs to GSD-2's main repository — out of scope for this package.
- True E2E tests with real Cursor CLI (conditional skip in CI) — deferred; mocked subprocess integration tests satisfy TEST-02.
- ENOENT guard in `AcpTransport` for post-startup binary removal — not implemented.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ERRH-01 | Provider detects and reports when Cursor CLI is not installed | D-01/D-02/D-03: upfront `execFile --version` check in `registerCursorAcpProvider`, throws `CursorCliNotFoundError` with actionable message |
| ERRH-02 | Provider handles expired/missing authentication with clear error messages | D-03/D-04: `CursorAuthError` extends `TransportError`, wraps original cause, replaces plain `Error` throw in `session-pool.ts:184-191` |
| ERRH-03 | Provider handles session creation and prompt errors, mapping to GSD-2 error events | D-03/D-05: `CursorSessionError` extends `TransportError`, slots into existing catch block in `provider.ts:322-341`, error type name surfaces in `errorMessage` field |
| TEST-01 | Unit tests cover event translator, transport message handling, and session pool logic | Existing tests already cover these; this requirement asks for coverage audit and gap-fill for new error classes |
| TEST-02 | End-to-end tests prove ACP integration works with real Cursor CLI | D-06/D-07: mocked subprocess integration test with 4 scenario paths — a fixture Node.js script speaks JSON-RPC over stdio |
| TEST-03 | Setup, configuration, and usage documentation provided | D-08: README.md, TSDoc on public API, TESTING.md |
</phase_requirements>

---

## Standard Stack

### Core (already in project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^3.0.0 | Test runner | Already the project test framework; all 100 existing tests use it |
| typescript | ^5.7.0 | Language | Project language — TSDoc is native TS feature |
| node:child_process | Node built-in | Subprocess spawning for mock ACP server | Used throughout existing code |

### No New Dependencies Required

Phase 5 requires no new npm packages. All implementation uses:
- Existing `src/errors.ts` extension pattern (pure TypeScript)
- Vitest for test execution (already installed)
- Node.js built-in `child_process.spawn` for mock ACP fixture
- TSDoc comments (TypeScript compiler feature, no extra tooling)

**Installation:** None needed.

**Version verification:**
```bash
npm list vitest typescript
# vitest@3.x.x, typescript@5.x.x — confirmed from package.json
```

---

## Architecture Patterns

### Recommended Project Structure (additions only)

```
src/
├── errors.ts            # ADD: CursorCliNotFoundError, CursorAuthError, CursorSessionError
├── register.ts          # MODIFY: add CLI detection before discoverModelIds()
├── session-pool.ts      # MODIFY: replace plain Error throw with CursorAuthError
├── provider.ts          # MODIFY: update catch block to use CursorSessionError
├── index.ts             # MODIFY: ensure new error classes are re-exported
├── __fixtures__/
│   └── mock-acp-server.ts  # NEW: mock ACP subprocess for integration tests
└── integration.test.ts  # NEW: integration tests using mock subprocess

README.md                # NEW: project root
TESTING.md               # NEW: project root
```

The `tests/` top-level directory does not yet exist; `vitest.config.ts` includes `tests/**/*.test.ts` in the glob, so either location works. Given all existing tests live in `src/`, placing the integration test in `src/integration.test.ts` is the consistent choice. The fixture helper belongs in `src/__fixtures__/`.

### Pattern 1: Error Class Extension

Extending `TransportError` following the established pattern in `src/errors.ts`:

```typescript
// Source: src/errors.ts (established pattern)
export class CursorCliNotFoundError extends TransportError {
  constructor() {
    super(
      'cursor-agent not found. Install Cursor from https://cursor.com and ' +
      'ensure cursor-agent is on your PATH, then run `cursor-agent login`.'
    );
    this.name = 'CursorCliNotFoundError';
  }
}

export class CursorAuthError extends TransportError {
  constructor(message: string, public readonly cause: unknown) {
    super(message);
    this.name = 'CursorAuthError';
  }
}

export class CursorSessionError extends TransportError {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'CursorSessionError';
  }
}
```

Key detail: TypeScript 4.6+ natively supports `cause` as an Error constructor option. However, the existing codebase defines `cause` as a public readonly field instead (simpler and avoids the need for `{ cause }` option syntax). Follow the existing pattern.

### Pattern 2: CLI Detection in registerCursorAcpProvider

The upfront binary check goes in `src/register.ts` before `discoverModelIds()`. The `accessSync` approach is unreliable (checks presence, not executability). `execFile binaryPath --version` is the most reliable cross-platform approach and already proven via Phase 4 tests:

```typescript
// Upfront binary check — throws CursorCliNotFoundError if binary absent
try {
  await execFileAsync(binaryPath, ['--version'], { timeout: 5_000 });
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  // ENOENT = file not found; other errors = binary exists but misbehaved
  if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
    throw new CursorCliNotFoundError();
  }
  // Binary exists but --version failed — not a "not found" error
  throw new Error(`cursor-agent binary check failed: ${msg}`);
}
```

**Discretion note:** The CONTEXT.md leaves the exact mechanism to discretion. Checking `ENOENT` on the `execFile` error is more reliable than `which` (cross-platform, no shell dependency) and more informative than `accessSync` (confirms the binary is actually executable). Recommended.

### Pattern 3: Mock ACP Subprocess for Integration Tests

The mock ACP server is a Node.js script that reads from `stdin`, parses JSON-RPC, and writes responses to `stdout`. It uses the same JSON-RPC framing as real cursor-agent (newline-delimited). A command-line argument controls which scenario it emulates:

```typescript
// src/__fixtures__/mock-acp-server.ts
// Spawned by integration tests via: node mock-acp-server.js --scenario=<name>
// Scenarios: happy-path, auth-error, session-error
import { createInterface } from 'node:readline';

const scenario = process.argv.find(a => a.startsWith('--scenario='))?.split('=')[1] ?? 'happy-path';

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  const msg = JSON.parse(line);
  const response = buildResponse(msg, scenario);
  if (response) process.stdout.write(JSON.stringify(response) + '\n');
});
```

The `buildResponse` function maps each incoming request method to appropriate responses per scenario. The integration test spawns this script with `spawn('node', ['src/__fixtures__/mock-acp-server.ts', '--scenario=happy-path'])` via `tsx` or compiled JS — see the pitfalls section for the TypeScript execution consideration.

### Pattern 4: Integration Test Structure

```typescript
// src/integration.test.ts
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { AcpTransport } from './transport.js';
import { AcpSessionPool } from './session-pool.js';
import { streamCursorAcp } from './provider.js';
import { CursorCliNotFoundError, CursorAuthError, CursorSessionError } from './errors.js';
import { registerCursorAcpProvider } from './register.js';

// Tests spawn real child processes; higher timeout needed
// vitest.config.ts already sets testTimeout: 10000 (10s), which is sufficient
```

The test creates a real `AcpTransport` pointing at the mock server binary path, then creates `AcpSessionPool` and calls `streamCursorAcp`. This exercises the full stack without mocking the transport.

### Anti-Patterns to Avoid

- **Mocking AcpTransport in integration tests:** Defeats the purpose. Integration tests must use real transport with a mock subprocess — not a mock transport.
- **Using `process.exit()` in mock server:** The mock server should close naturally (stdin close triggers exit). Calling `process.exit()` can cause flaky tests if the client reads the exit before processing all output.
- **Single CursorSessionError for both session/new and session/prompt in different catch blocks:** Both errors should be the same class but the error message should indicate which method failed. This keeps it simple per CONTEXT.md discretion guidance.
- **Skipping `this.name = 'ClassName'` in error constructors:** The existing `errors.ts` always sets `this.name`. New classes must do the same so `instanceof` checks and `error.name` string comparisons both work.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Binary detection | Custom shell-out to `which` | `execFile` with ENOENT check | `which` is not available on Windows; `execFile` with ENOENT is cross-platform and already proven in the codebase |
| ACP protocol for mock server | A full protocol implementation | A minimal line-by-line JSON-RPC responder | The mock server only needs to respond to the 5-6 methods used in tests — full protocol is out of scope |
| Integration test subprocess management | Custom process lifecycle management | Node.js `spawn` + `afterEach` cleanup | `spawn` with `proc.kill()` in teardown is sufficient; no lifecycle library needed |

**Key insight:** The codebase's existing `transport.test.ts` already validates subprocess communication thoroughly. The integration test only needs to prove that errors flow correctly end-to-end — it does not need to re-test low-level transport details.

---

## Common Pitfalls

### Pitfall 1: Mock ACP Server TypeScript Execution

**What goes wrong:** The mock server file `src/__fixtures__/mock-acp-server.ts` is TypeScript. When spawning it in integration tests with `spawn('node', ['src/__fixtures__/mock-acp-server.ts'])`, Node.js cannot run `.ts` files directly. The tests will fail with "unknown file extension .ts".

**Why it happens:** Integration tests run via vitest (which uses tsx/esbuild internally), but spawned child processes are vanilla Node.js unless explicitly configured otherwise.

**How to avoid:** Two options:
1. Write the mock server in plain `.mjs` (JavaScript). Simplest approach — no TypeScript needed for a small fixture.
2. Use `tsx` to spawn: `spawn('node', ['--import', 'tsx', 'src/__fixtures__/mock-acp-server.ts'])`. Requires `tsx` to be installed (it is a devDep in similar projects but NOT in this one).

**Recommendation:** Write the mock server as `src/__fixtures__/mock-acp-server.mjs` (plain ESM JavaScript). This avoids the TypeScript execution problem entirely and keeps the fixture dependency-free.

### Pitfall 2: initPromise Reset on CursorAuthError

**What goes wrong:** If `CursorAuthError` is thrown from `ensureInitialized()` but `this.initPromise` is NOT reset to `null`, subsequent calls to `ensureInitialized()` will re-use the already-rejected promise. The pool becomes permanently broken after one auth failure.

**Why it happens:** The existing `session-pool.ts` code at line 186 already does `this.initPromise = null` before throwing. When replacing the plain `Error` with `CursorAuthError`, the reset must be preserved. It is easy to accidentally move the throw before the reset, or omit the reset during a refactor.

**How to avoid:** Keep the `this.initPromise = null` line immediately before the throw in the catch block:
```typescript
} catch (error) {
  this.initPromise = null;  // MUST come before throw
  throw new CursorAuthError(`Authentication failed. ...`, error);
}
```

**Warning signs:** Session pool tests will reveal this if they test retry-after-auth-failure behavior.

### Pitfall 3: vi.hoisted() Pattern for execFile Mocking

**What goes wrong:** When adding unit tests for the CLI detection logic in `register.ts`, the same promisify mock pattern from Phase 4 must be used. New test authors may attempt a simpler `vi.mock` without `vi.hoisted()`, which will fail because `execFileAsync = promisify(execFile)` runs at module load time.

**Why it happens:** Vitest hoists `vi.mock()` calls but the mock factory must be available before module evaluation. `vi.hoisted()` ensures the mock factory runs first.

**How to avoid:** Copy the exact pattern from `src/register.test.ts` lines 19-29 when writing any new test that mocks `execFile`.

### Pitfall 4: CursorSessionError vs Generic Error in Provider Catch

**What goes wrong:** The provider catch block at `provider.ts:322-341` currently extracts `err.message` for all errors. After introducing `CursorSessionError`, the catch block needs to wrap non-`CursorSessionError` errors in one before surfacing them — otherwise the error class information is lost.

**Why it happens:** The existing catch block is generic. If `session/new` or `session/prompt` throws a raw `JsonRpcError`, it won't be a `CursorSessionError` automatically.

**How to avoid:** In the provider catch block, check if the error is already a `CursorSessionError`; if not, wrap it:
```typescript
} catch (err) {
  const sessionErr = err instanceof CursorSessionError
    ? err
    : new CursorSessionError(err instanceof Error ? err.message : String(err), err);
  // ... push error event using sessionErr.message
}
```

### Pitfall 5: TSDoc on Re-Exports

**What goes wrong:** `src/index.ts` re-exports everything with `export * from './errors.js'`. TSDoc comments placed only on the source class definition may not render in IDE hover docs for consumers who import from the package root.

**Why it happens:** TSDoc tooling reads doc comments from the declaration file. With `export *`, the comment must be on the original declaration — which is the correct approach. The pitfall is accidentally putting docs only on the `index.ts` re-export line (which is not valid TSDoc syntax) instead of on the source class/function.

**How to avoid:** Put TSDoc comments on the actual declarations in `errors.ts`, `register.ts`, and `provider.ts`. The `index.ts` re-exports only.

### Pitfall 6: Mock ACP Server stdin Close Handling

**What goes wrong:** Integration tests that `kill()` the mock server child process before stdin closes may leave the readline listener in a broken state, causing the test process to hang waiting for the stream to end.

**Why it happens:** Node.js readline keeps the event loop alive until the input stream is closed.

**How to avoid:** Call `rl.close()` or ensure the mock server's main loop exits when stdin closes:
```javascript
process.stdin.on('close', () => process.exit(0));
```

---

## Code Examples

Verified patterns from existing codebase:

### Error Class Constructor Pattern (from src/errors.ts)

```typescript
// Source: src/errors.ts
export class RequestTimeoutError extends TransportError {
  constructor(
    public readonly method: string,
    public readonly timeoutMs: number,
  ) {
    super(`Request "${method}" timed out after ${timeoutMs}ms`);
    this.name = 'RequestTimeoutError';
  }
}
```
New error classes follow this exact pattern: call `super(message)`, then set `this.name`.

### vi.hoisted() + execFile Mocking (from src/register.test.ts)

```typescript
// Source: src/register.test.ts lines 19-29
const { mockExecFileFn } = vi.hoisted(() => {
  const PROMISIFY_CUSTOM = Symbol.for('nodejs.util.promisify.custom');
  const customPromiseFn = vi.fn();
  const execFileMock = vi.fn();
  (execFileMock as any)[PROMISIFY_CUSTOM] = customPromiseFn;
  return { mockExecFileFn: execFileMock };
});

vi.mock('node:child_process', () => ({
  execFile: mockExecFileFn,
}));
```
Reuse for CLI detection unit test.

### Provider Catch Block Structure (from src/provider.ts lines 322-341)

```typescript
// Source: src/provider.ts
} catch (err) {
  if (!isDone) {
    isDone = true;
    const errMsg = err instanceof Error ? err.message : String(err);
    const errorMessage: AssistantMessage = {
      // ... shape
      stopReason: 'error' as const,
      errorMessage: errMsg,
    };
    stream.push({ type: 'error', reason: 'error', error: errorMessage });
    stream.end(errorMessage);
  }
}
```
`CursorSessionError` slots into `errMsg` extraction — `err.name` should also be surfaced.

### Auth Error Site (from src/session-pool.ts lines 184-191)

```typescript
// Source: src/session-pool.ts
} catch (error) {
  this.initPromise = null; // Allow retry after fixing auth
  throw new Error(
    `Authentication failed. Set CURSOR_API_KEY or run \`cursor-agent login\`. ` +
      `Original error: ${error instanceof Error ? error.message : String(error)}`,
  );
}
```
Replace `new Error(...)` with `new CursorAuthError(message, error)`. Keep `this.initPromise = null` before the throw.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Plain `Error` for auth failures | `CursorAuthError extends TransportError` | Phase 5 | Callers can `instanceof` check; cause is preserved |
| Generic catch-all in provider | `CursorSessionError` with preserved cause | Phase 5 | Downstream consumers can distinguish error types |
| No binary check at startup | `CursorCliNotFoundError` thrown upfront | Phase 5 | Fail fast with actionable message at registration time, not during streaming |

**Deprecated/outdated:**
- Plain `Error` throws in `session-pool.ts` and `provider.ts`: replaced by typed errors in Phase 5.

---

## Open Questions

1. **Mock server TypeScript vs JavaScript**
   - What we know: The fixture can be `.ts` (requires tsx or compile step) or `.mjs` (plain ESM, no tooling needed)
   - What's unclear: Whether the planner prefers keeping all source in TypeScript or pragmatically uses `.mjs` for a test fixture
   - Recommendation: Use `.mjs` for the mock server. It is a test fixture, not production code — no types needed, and it eliminates a runtime dependency on tsx or a build step.

2. **CursorSessionError scope: session/new vs session/prompt only, or also getOrCreateSession failures**
   - What we know: CONTEXT.md says "session/new or session/prompt failures". `getOrCreateSession` wraps `session/new`.
   - What's unclear: Should `getOrCreateSession` failures (that are not auth failures) become `CursorSessionError`, or only failures within the provider's `stream()` catch block?
   - Recommendation: Wrap in `CursorSessionError` at the provider catch block level (lines 322-341). The `getOrCreateSession` level already handles auth via `CursorAuthError`. Any remaining non-auth error from `getOrCreateSession` that reaches the provider catch block should become a `CursorSessionError`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node | Runtime | yes | system node | — |
| vitest | Test runner | yes | ^3.0.0 (installed) | — |
| tsx | TS execution for mock server | NOT installed | — | Write mock server as .mjs |

**Missing dependencies with no fallback:** None — all required capabilities are present.

**Missing dependencies with fallback:**
- `tsx` is not installed. Mock ACP server must be written as `.mjs` (plain ESM JavaScript), not `.ts`. This is the recommended approach regardless.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- --reporter=verbose src/integration.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ERRH-01 | `registerCursorAcpProvider` throws `CursorCliNotFoundError` for missing binary | unit | `npm test -- register.test.ts` | exists — gap: new test cases needed |
| ERRH-02 | `AcpSessionPool` throws `CursorAuthError` on auth failure; preserves cause; allows retry | unit + integration | `npm test -- session-pool.test.ts` | exists — gap: new test cases needed |
| ERRH-03 | `streamCursorAcp` maps session errors to GSD-2 `error` event with typed name | unit + integration | `npm test -- provider.test.ts integration.test.ts` | provider.test.ts exists; integration.test.ts is Wave 0 gap |
| TEST-01 | Unit tests cover EventTranslator, AcpTransport message handling, session pool logic | unit | `npm test -- event-translator.test.ts transport.test.ts session-pool.test.ts` | all exist; gap: coverage for new error classes |
| TEST-02 | Integration test: full stream, auth error, session error, CLI not found — all four paths | integration | `npm test -- integration.test.ts` | Wave 0 gap |
| TEST-03 | README.md, TSDoc, TESTING.md exist and are accurate | manual review | n/a | Wave 0 gap |

### Sampling Rate

- **Per task commit:** `npm test` (full suite runs in ~21s; fast enough to run on every commit)
- **Per wave merge:** `npm test && npm run typecheck`
- **Phase gate:** Full suite green + typecheck clean before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/__fixtures__/mock-acp-server.mjs` — mock ACP subprocess fixture for integration tests (TEST-02)
- [ ] `src/integration.test.ts` — covers TEST-02 (four integration paths) and ERRH-01/02/03 end-to-end
- [ ] Additional test cases in `src/register.test.ts` for `CursorCliNotFoundError` throw (ERRH-01)
- [ ] Additional test cases in `src/session-pool.test.ts` for `CursorAuthError` class, `cause` field, retry behavior (ERRH-02)
- [ ] Additional test cases in `src/provider.test.ts` for `CursorSessionError` mapping to GSD-2 error event (ERRH-03)
- [ ] `README.md` — project root (TEST-03)
- [ ] `TESTING.md` — project root (TEST-03)

---

## Project Constraints (from CLAUDE.md)

No `CLAUDE.md` was found in the project root. No additional project-level directives to enforce.

Inferred conventions from existing code:
- All source files use TypeScript strict mode (`"strict": true` in tsconfig.json)
- ES modules throughout (`"type": "module"` in package.json, `.js` import extensions on `.ts` sources)
- Vitest for all testing; no Jest
- `this.name = 'ClassName'` required in all Error subclass constructors
- Inline type definitions (no peer dep imports) — all GSD-2 types defined inline
- `vi.hoisted()` pattern required for any mock of `node:child_process`

---

## Sources

### Primary (HIGH confidence)

- `src/errors.ts` — complete error hierarchy; verified all four existing classes and their constructor patterns
- `src/register.ts` — complete `registerCursorAcpProvider` and `discoverModelIds` implementation; confirmed `execFileAsync` call site
- `src/session-pool.ts` — confirmed auth error throw location (lines 184-191); confirmed `this.initPromise = null` reset pattern
- `src/provider.ts` — confirmed catch block location (lines 322-341); confirmed error event structure
- `src/transport.test.ts`, `src/register.test.ts`, `src/session-pool.test.ts`, `src/provider.test.ts` — confirmed test patterns, mock strategies, vi.hoisted usage
- `vitest.config.ts` — confirmed test glob includes both `src/**` and `tests/**`
- `package.json` — confirmed vitest ^3.0.0, typescript ^5.7.0, no tsx dependency

### Secondary (MEDIUM confidence)

- `context/cursor_acp.md` — ACP protocol documentation confirming session lifecycle and method names used in mock server design

### Tertiary (LOW confidence)

- Node.js readline `close` event behavior for process exit — based on known Node.js behavior; not separately verified against Node.js 22 docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from package.json and existing source
- Architecture: HIGH — patterns derived from existing codebase; no speculation
- Pitfalls: HIGH for pitfalls 1-4 (derived from existing code and known Node.js behavior); MEDIUM for pitfalls 5-6 (general TypeScript/Node.js knowledge)

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (dependencies stable; no fast-moving components)
