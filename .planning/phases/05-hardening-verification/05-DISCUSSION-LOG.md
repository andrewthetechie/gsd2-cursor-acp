# Phase 5: Hardening & Verification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 05-hardening-verification
**Areas discussed:** CLI detection, Error class design, E2E test strategy, Documentation scope

---

## CLI Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Upfront in register() | registerCursorAcpProvider() does a quick binary check and throws CursorCliNotFoundError immediately if missing | ✓ |
| Lazy on first spawn | Detect ENOENT when AcpTransport first tries to spawn cursor-agent | |
| Both | Upfront check in register(), plus ENOENT guard in transport for robustness | |

**User's choice:** Upfront in register()
**Notes:** Error message must be actionable — include install instructions and mention `cursor-agent login`.

| Option | Description | Selected |
|--------|-------------|----------|
| Install + login instructions | "cursor-agent not found. Install Cursor from https://cursor.com and ensure cursor-agent is on your PATH, then run `cursor-agent login`." | ✓ |
| Binary name only | "cursor-agent binary not found on PATH. Please install Cursor CLI." | |
| You decide | Claude picks a clear, actionable message | |

**User's choice:** Install + login instructions

---

## Error Class Design

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — new typed classes | Add CursorCliNotFoundError and CursorAuthError to errors.ts, extending TransportError | ✓ |
| No — improve messages only | Keep throwing plain Error with better string messages | |
| You decide | Claude decides based on existing hierarchy | |

**User's choice:** Yes — new typed classes

| Option | Description | Selected |
|--------|-------------|----------|
| CursorCliNotFoundError | Thrown when cursor-agent binary is not on PATH (ERRH-01) | ✓ |
| CursorAuthError | Thrown when authentication is expired or missing (ERRH-02) | ✓ |
| CursorSessionError | Thrown on session/new or session/prompt failures (ERRH-03) | ✓ |
| You decide | Claude picks what makes sense | |

**User's choice:** All three typed error classes

---

## E2E Test Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Mocked subprocess integration | Spawn a real Node.js child process speaking ACP protocol as fixture | ✓ |
| True E2E — requires real Cursor | Tests invoke actual cursor-agent, skipped in CI if not installed | |
| Documented manual steps only | No automated E2E; TESTING.md with manual verification steps | |

**User's choice:** Mocked subprocess integration

| Coverage | Description | Selected |
|----------|-------------|----------|
| Full stream happy path | Spawn mock ACP server, call stream(), verify events | ✓ |
| Auth failure path | Mock authenticate returning error — verify CursorAuthError | ✓ |
| Session/prompt error path | Mock session/prompt returning error — verify CursorSessionError | ✓ |
| CLI not found path | Non-existent binary — verify CursorCliNotFoundError | ✓ |

**User's choice:** All four coverage paths

---

## Documentation Scope

| Option | Description | Selected |
|--------|-------------|----------|
| README.md | Installation, configuration, usage example | ✓ |
| JSDoc on public exports | TSDoc on registerCursorAcpProvider, error classes, CursorAcpProvider | ✓ |
| TESTING.md | How to run tests, what each file covers, manual verification steps | ✓ |
| GSD-2 integration guide | Doc in context/gsd-2 for wiring cursor-acp into GSD-2 | |

**User's choice:** README.md + JSDoc on public exports + TESTING.md

---

## Claude's Discretion

- Exact binary detection mechanism (execFile --version, which, or accessSync)
- Mock ACP server fixture file location
- Whether CursorSessionError has subclasses for session/new vs session/prompt errors

## Deferred Ideas

- Contributing docs to GSD-2 main repository
- True E2E tests with real Cursor CLI (conditional CI skip)
- ENOENT guard in AcpTransport for post-startup binary removal
