# Phase 4: Model Discovery & Registration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 04-model-discovery-registration
**Areas discussed:** Discovery mechanism, Model metadata strategy, Canonical ID & ThinkingLevel mapping, Discovery timing & lifecycle

---

## Discovery Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Cursor CLI subcommand | Run cursor-agent with a models/list subcommand; fall back to static list on failure | |
| Static fallback list only | Ship a hardcoded list of known Cursor subscription models | |
| ACP initialize response | Parse the ACP initialize handshake for model info | |
| cursor-agent models command | Use the cursor-agent models command that lists all possible models | ✓ |

**User's choice:** Use `cursor-agent models` CLI command (user explicitly named the command)

| Option | Description | Selected |
|--------|-------------|----------|
| Fall back to static list | Non-fatal failure; use hardcoded baseline | |
| Throw an error | Hard error if discovery fails | ✓ |
| Register zero models | Log warning, register nothing | |

**User's choice:** Throw an error on discovery failure — no fallback.

---

## Model Metadata Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Static lookup table keyed on model ID | Ship a table mapping known Cursor model IDs to metadata | ✓ |
| cursor-agent models output includes metadata | Parse metadata from CLI output directly | |
| Zero/unknown for all fields | All metadata defaults to zero/false | |

**User's choice:** Static lookup table keyed on model ID (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Safe defaults | contextWindow: 128000, reasoning: false, cost: zeros | ✓ |
| Omit unknown models | Skip models not in the lookup table | |
| Propagate whatever CLI returns | Use CLI output metadata where available | |

**User's choice:** Safe defaults for unknown models (recommended)

---

## Canonical ID & ThinkingLevel Mapping

| Option | Description | Selected |
|--------|-------------|----------|
| Expose Cursor model IDs as-is | Register with native Cursor IDs (e.g. 'claude-sonnet-4-5') | |
| Prefix with cursor-acp/ | Register as 'cursor-acp/claude-sonnet-4-5' to namespace them | ✓ |
| Map GSD-2 canonical IDs | Alias canonical IDs to Cursor variants | |

**User's choice:** Prefix with `cursor-acp/`

| Option | Description | Selected |
|--------|-------------|----------|
| Silently ignore ThinkingLevel | Keep Phase 3 behavior — ignore reasoning/thinkingBudgets | ✓ |
| Map ThinkingLevel to session mode | high/xhigh → plan mode, low/minimal → ask mode | |
| Pass ThinkingLevel as prompt hint | Prepend instruction for extended thinking | |

**User's choice:** Silently ignore ThinkingLevel (recommended) — continues Phase 3 pattern

---

## Discovery Timing & Lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Eagerly at registerCursorAcpProvider() | Make function async; discovery runs at registration | ✓ |
| Lazily on first stream() call | Defer until first use; registration stays synchronous | |
| Separate discoverModels() call | Separate exported function for caller control | |

**User's choice:** Eagerly at `registerCursorAcpProvider()` (recommended) — make it async

| Option | Description | Selected |
|--------|-------------|----------|
| No caching — always re-discover | Fresh discovery every process startup | ✓ |
| Cache to disk with TTL | JSON file cache with expiry | |

**User's choice:** No caching (recommended) — always re-discover on startup

---

## Claude's Discretion

- Exact `cursor-agent models` subcommand syntax and output format parsing
- Whether to define the static metadata lookup table inline in `register.ts` or in a new `src/model-metadata.ts`
- Which GSD-2 model registry function to call to register discovered models

## Deferred Ideas

- Disk caching with TTL — too complex for Phase 4
- ThinkingLevel → session mode mapping
- GSD-2 canonical ID aliasing (e.g. `claude-sonnet-4-6` → Cursor's `claude-sonnet-4-5`)
- Session-mode-per-model routing
