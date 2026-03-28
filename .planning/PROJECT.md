# GSD-Cursor: Cursor ACP Provider for GSD-2

## What This Is

An LLM provider adapter that integrates Cursor as a first-class provider in GSD-2's `@gsd/pi-ai` package, using the Agent Client Protocol (ACP) over stdio. This lets GSD-2 users run subagent tasks through Cursor's coding agent, leveraging whatever models are available on their Cursor subscription (Claude, GPT, Gemini, Grok, etc.).

## Current Milestone: v1.0 Cursor ACP Provider

**Goal:** Integrate Cursor as a first-class GSD-2 provider via the Agent Client Protocol (ACP) over stdio.

**Target features:**
- ACP transport layer (JSON-RPC over stdio to `cursor agent acp`)
- ACP lifecycle management (initialize → authenticate → session/new → session/prompt)
- Dynamic model discovery from Cursor CLI
- Provider registration in `@gsd/pi-ai` implementing `ApiProvider` interface
- Streaming response mapping to `AssistantMessageEventStream`
- Permission handling for `session/request_permission`
- Tool handling following existing GSD-2 patterns
- Error handling for CLI/auth/session failures
- Test suite and documentation

## Core Value

GSD-2 subagents can seamlessly use Cursor as their coding backend — same interface as Anthropic or Google providers, but powered by Cursor's agent with full ACP protocol support.

## Requirements

### Validated

- ✓ ACP transport layer: JSON-RPC over stdio to `cursor agent acp` — Phase 1
- ✓ ACP lifecycle management (initialize → authenticate → session/new) with lazy init and session reuse — Phase 2 (AUTH-01)
- ✓ Permission handling: respond to `session/request_permission` with configurable policy — Phase 2 (AUTH-02, AUTH-03)
- ✓ API key authentication via `CURSOR_API_KEY` env var passed as `--api-key` CLI arg — Phase 2 (AUTH-01)

### Validated

- ✓ Cursor appears as a provider in GSD-2's provider registry via `registerCursorAcpProvider()` — Phase 3 (PROV-03)
- ✓ Provider implements `ApiProvider` interface (`stream()` and `streamSimple()` return `AssistantMessageEventStream` synchronously) — Phase 3 (PROV-01, PROV-02)
- ✓ ACP streaming: `session/update` notifications translated to text/thinking/toolcall events; AbortSignal wired to `session/cancel` — Phase 3 (STRM-01, STRM-02, STRM-03, STRM-04)

### Validated

- ✓ Dynamic model discovery: `registerCursorAcpProvider()` spawns `cursor-agent --list-models`, parses output, and registers models with `cursor-acp/` prefix — Phase 4 (MODL-01, MODL-02)
- ✓ Discovered models registered with proper metadata (context window, capabilities, cost) via static lookup table with safe defaults for unknown models — Phase 4 (MODL-03)

### Validated

- ✓ Error handling for CLI not installed, auth failures, session errors via typed error classes (`CursorCliNotFoundError`, `CursorAuthError`, `CursorSessionError`) — Phase 5 (ERRH-01, ERRH-02, ERRH-03)
- ✓ Integration test suite proving full-stack ACP wiring without requiring Cursor installed (mock ACP subprocess, 4-path test coverage) — Phase 5 (TEST-01, TEST-02)
- ✓ Documentation: README.md, TESTING.md, TSDoc on all public exports — Phase 5 (TEST-03)

### Out of Scope

- Cursor's `--print` mode (simpler but less capable than ACP) — we're going full ACP
- Building a standalone ACP adapter (like cursor-agent-acp-npm) — this is a GSD-2 provider plugin
- Modifying Cursor CLI itself — we consume it as-is
- Mobile or web transport — stdio only (local Cursor CLI)
- MCP server integration through Cursor — GSD-2 has its own MCP handling

## Context

**GSD-2 Provider System:**
- Providers live in `@gsd/pi-ai` package at `packages/pi-ai/src/providers/`
- Register via `registerApiProvider()` in `register-builtins.ts`
- Models defined in `models.custom.ts` (or `models.generated.ts` for catalog models)
- API keys resolved from env vars via `env-api-keys.ts`
- All providers produce `AssistantMessageEventStream` (async iterable of typed events)

**Cursor ACP Protocol:**
- Transport: stdio with newline-delimited JSON-RPC
- Session modes: `agent` (full tools), `plan` (read-only), `ask` (Q&A)
- Streaming: `session/update` notifications deliver incremental content
- Permissions: client must respond to `session/request_permission` requests
- Extension methods: `cursor/ask_question`, `cursor/create_plan`, `cursor/task`, etc.

**Reference Implementations:**
- `context/pi-cursor-provider/` — simpler `--print` mode integration (Pi provider, not ACP)
- `context/cursor-agent-acp-npm/` — full ACP adapter for editors (Zed, JetBrains, Neovim)
- `context/cursor_acp.md` — official ACP protocol documentation

**Key Files in GSD-2:**
- `packages/pi-ai/src/types.ts` — `Api`, `Provider`, `Model`, `Context`, `AssistantMessageEvent` types
- `packages/pi-ai/src/api-registry.ts` — `ApiProvider` interface, `registerApiProvider()`
- `packages/pi-ai/src/providers/anthropic.ts` — reference provider implementation
- `packages/pi-ai/src/providers/register-builtins.ts` — provider registration
- `packages/pi-ai/src/models.custom.ts` — custom model definitions
- `packages/pi-ai/src/env-api-keys.ts` — API key env var mapping
- `packages/pi-ai/src/stream.ts` — unified stream entry point

## Constraints

- **Transport**: Must use ACP (JSON-RPC over stdio) — not HTTP, not `--print` mode
- **Dependency**: Requires Cursor CLI installed locally (`cursor` or `cursor-agent` binary)
- **Auth**: Cursor authentication is external (browser-based login or API key) — provider must handle auth flow gracefully
- **Compatibility**: Must conform to GSD-2's existing `ApiProvider` interface exactly — no special-casing in consuming code
- **Node**: Minimum Node 22.0.0 (matching GSD-2)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Full ACP over stdio (not --print mode) | ACP supports sessions, permissions, streaming, tool use — production-grade integration | -- Pending |
| Dynamic model discovery (not static list) | Cursor subscription models change; discovery ensures accuracy | -- Pending |
| Follow existing provider tool handling pattern | Consistency with Anthropic/Google providers; no special-casing needed | -- Pending |
| New API type "cursor-acp" (not reusing openai-completions) | ACP is a fundamentally different transport — JSON-RPC over stdio vs HTTP | -- Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-28 after Phase 5 complete — v1.0 milestone complete*
