# Phase 4: Model Discovery & Registration - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Dynamically discover which Cursor models are available via the `cursor-agent` CLI, register them in GSD-2's model system with proper metadata and namespaced IDs, and ensure the provider lifecycle correctly exposes discovered models to callers.

This phase does NOT cover: caching discovered models to disk between restarts, session-mode-per-model routing, or ThinkingLevel mapping to session behaviors (all deferred).

</domain>

<decisions>
## Implementation Decisions

### Discovery Mechanism

- **D-01:** Use `cursor-agent models` (or equivalent subcommand) to discover available models. Run this as a child process invocation separate from the ACP stdio session.
- **D-02:** If `cursor-agent models` fails for any reason (CLI not installed, unsupported subcommand, non-zero exit, parse failure), throw an error. No fallback to a static list — discovery failure is hard-fatal.

### Model Metadata Strategy

- **D-03:** Ship a static lookup table keyed on Cursor model ID (e.g. `"claude-sonnet-4-5"`, `"gpt-4o"`) mapping each to known metadata: `contextWindow`, `reasoning`, `maxTokens`. Cost fields are all zero (subscription-based, no per-token billing).
- **D-04:** For models returned by `cursor-agent models` that are NOT in the static lookup table (newly added Cursor models), register them with safe defaults: `contextWindow: 128000`, `reasoning: false`, `maxTokens: 8192`, `cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }`.
- **D-05:** The `input` capability is always `["text"]` — Cursor CLI does not support image attachments (per Out of Scope in PROJECT.md).

### Model ID & Naming

- **D-06:** Prefix all discovered model IDs with `cursor-acp/` when registering them (e.g. `"cursor-acp/claude-sonnet-4-5"`, `"cursor-acp/gpt-4o"`). This namespaces them in GSD-2's registry and avoids collisions with Anthropic/OpenAI providers.
- **D-07:** The native Cursor model ID (without prefix) is used in ACP `session/new` and `session/prompt` calls. The `cursor-acp/` prefix is stripped before sending to ACP.

### ThinkingLevel Handling

- **D-08:** ThinkingLevel (`minimal` | `low` | `medium` | `high` | `xhigh`) passed via `streamSimple`'s `reasoning`/`thinkingBudgets` options is silently ignored. Continues the Phase 3 pattern. Cursor controls thinking internally per model.

### Discovery Timing & Lifecycle

- **D-09:** Make `registerCursorAcpProvider()` async — it returns `Promise<void>`. Callers must `await registerCursorAcpProvider()` before using cursor-acp models. This is a breaking change to the Phase 3 signature.
- **D-10:** Discovery runs eagerly inside `registerCursorAcpProvider()` — no lazy deferral. Models are registered before the function resolves.
- **D-11:** No disk caching between process restarts. Discovery runs fresh every time `registerCursorAcpProvider()` is called. One CLI invocation per process startup.

### Claude's Discretion

- How to invoke `cursor-agent models` — exact subcommand syntax, arg parsing, output format parsing. Planner should check actual cursor-agent CLI help if possible, otherwise make a reasonable assumption and document it.
- Where to define the static metadata lookup table — inline in `register.ts` or a new `src/model-metadata.ts` file.
- What GSD-2 model registry function to call to register discovered models — check `context/gsd-2/packages/pi-ai/src/models.ts` for the addModel/registerModel API.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### ACP Protocol
- `context/cursor_acp.md` — Official ACP protocol documentation (transport, session lifecycle, message shapes)

### GSD-2 Model System
- `context/gsd-2/packages/pi-ai/src/types.ts` — `Model<Api>`, `ThinkingLevel`, `KnownProvider`, `KnownApi` type definitions
- `context/gsd-2/packages/pi-ai/src/models.custom.ts` — Pattern for defining custom provider models with full metadata (id, name, api, provider, baseUrl, reasoning, input, cost, contextWindow, maxTokens, compat)
- `context/gsd-2/packages/pi-ai/src/models.ts` — Model registry implementation; shows how models are registered and how `addApplyCapabilityPatches` works
- `context/gsd-2/packages/pi-ai/src/api-registry.ts` — `registerApiProvider()` interface

### Existing Codebase
- `src/provider.ts` — Inline `Model` interface (lines 188-199); this is the shape discovered models must conform to. Also contains the current module-level pool singleton pattern.
- `src/register.ts` — Current synchronous `registerCursorAcpProvider()` — this becomes async in Phase 4
- `src/types.ts` — `TransportOptions` (binaryPath, binaryArgs) — discovery subprocess should reuse the same binaryPath convention
- `src/index.ts` — Public exports to update after signature change

### Dynamic Discovery Reference
- `context/gsd-2/.plans/dynamic-model-discovery.md` — GSD-2's own dynamic model discovery plan (reference for patterns, not for direct reuse)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/types.ts` `TransportOptions.binaryPath` (default: `"cursor-agent"`) — use this same binary for the discovery subprocess invocation. Respect any user-configured `binaryPath` override.
- `src/provider.ts` inline `Model` interface — discovered models must match this exact shape (already aligned with GSD-2's `Model<"cursor-acp">` type).
- `src/api-registry.ts` `registerApiProvider()` — already wired; no changes needed to the provider registration side.

### Established Patterns
- Lazy init via promise mutex (see `AcpSessionPool.initPromise` in `session-pool.ts`) — similar pattern can be used for the discovery result if needed.
- Inline GSD-2 type definitions (all prior phases define types inline because `@gsd/pi-ai` is a peer dep not installed). Discovery metadata types should follow the same pattern.
- `src/register.test.ts` already exists — extend it to cover async `registerCursorAcpProvider()` and model registration assertions.

### Integration Points
- `registerCursorAcpProvider()` in `src/register.ts` — entry point for all Phase 4 changes
- `src/index.ts` — exports `registerCursorAcpProvider`; any signature change must be reflected here
- `streamCursorAcp` in `src/provider.ts` — when it sends `session/new`, it should pass the un-prefixed model ID to ACP (strip `cursor-acp/` prefix from `model.id`)

</code_context>

<specifics>
## Specific Ideas

- The `cursor-acp/` prefix approach keeps things clean in GSD-2's registry — no collision with e.g. `anthropic/claude-sonnet-4-5` from the built-in catalog.
- The static metadata table should cover at minimum: the Claude family (claude-3-5-sonnet, claude-sonnet-4-5, claude-opus-4), GPT-4o, Gemini 2.0/2.5, and any other models Cursor commonly advertises.
- Discovery subprocess should be a simple `child_process.execFile` call (not an ACP session) — run `cursor-agent models` (or `cursor-agent --list-models` — check actual CLI), capture stdout, parse JSON or line-delimited output.

</specifics>

<deferred>
## Deferred Ideas

- Disk caching of discovered models with TTL (suggested GSD-2 pattern in dynamic-model-discovery.md) — too much complexity for Phase 4; re-discover on each startup.
- ThinkingLevel → session mode mapping (e.g. high thinking → plan mode) — deferred to future enhancement.
- Canonical ID aliasing (e.g. GSD-2's `claude-sonnet-4-6` → Cursor's `claude-sonnet-4-5`) — deferred; callers use `cursor-acp/` prefixed IDs directly.
- Session-mode-per-model (some models better in ask/plan/agent mode) — deferred to future enhancement.

</deferred>

---

*Phase: 04-model-discovery-registration*
*Context gathered: 2026-03-28*
