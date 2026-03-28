# Phase 1: ACP Transport - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-27
**Phase:** 01-acp-transport
**Areas discussed:** Package structure, ACP SDK dependency, Process lifecycle, CLI binary name

---

## Package Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Inside @gsd/pi-ai | New directory at packages/pi-ai/src/providers/cursor-acp/. Same pattern as anthropic.ts. Simplest. | |
| Separate package | New @gsd/pi-ai-cursor-acp package. Independent versioning, optional install. | ✓ |
| Standalone repo | This repo IS the package. Ships as its own npm module. | ✓ (refinement) |

**User's choice:** Separate package, specifically this repo as a standalone npm module with pi-ai types as peer dependency.
**Notes:** Two-step decision — first chose "Separate package", then confirmed "This repo (standalone)" over GSD-2 monorepo.

---

## ACP SDK Dependency

| Option | Description | Selected |
|--------|-------------|----------|
| Use ACP SDK (Recommended) | Import types from @agentclientprotocol/sdk. Stays in sync with spec. ~50KB dep. | ✓ |
| Own minimal types | Define own TypeScript types. Zero deps but manual spec tracking. | |
| You decide | Claude picks based on codebase patterns | |

**User's choice:** Use ACP SDK (Recommended)
**Notes:** None

---

## Process Lifecycle — Crash Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-restart once | Detect crash, restart, re-init. Fail on second crash within 30s. | ✓ |
| Fail and report | Surface error immediately. Let GSD-2 layer decide retry. | |
| Exponential backoff | Restart with 1s, 2s, 4s delays up to 3 attempts. | |
| You decide | Claude picks based on other providers | |

**User's choice:** Auto-restart once
**Notes:** None

---

## Process Lifecycle — Shutdown

| Option | Description | Selected |
|--------|-------------|----------|
| SIGTERM + 5s grace | Send SIGTERM, wait 5s, then SIGKILL. Standard graceful shutdown. | ✓ |
| Immediate SIGKILL | Kill immediately on host exit. | |
| You decide | Claude picks standard approach | |

**User's choice:** SIGTERM + 5s grace
**Notes:** None

---

## CLI Binary Name

| Option | Description | Selected |
|--------|-------------|----------|
| cursor-agent (Recommended) | Dedicated agent CLI binary. Most reliable for ACP. | ✓ |
| cursor agent (subcommand) | Use `cursor` binary with `agent acp` subcommand. | |
| Auto-detect | Try cursor-agent first, fall back to cursor agent. | |

**User's choice:** cursor-agent (Recommended)
**Notes:** None

---

## Claude's Discretion

- JSON-RPC message framing details
- Internal error types
- Test structure and mocks
- stdout parsing approach (readline vs manual)

## Deferred Ideas

None
