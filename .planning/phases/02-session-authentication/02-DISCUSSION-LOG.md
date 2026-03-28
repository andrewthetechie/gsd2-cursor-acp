# Phase 2: Session & Authentication - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 02-session-authentication
**Areas discussed:** Session scoping, Auth flow, Permission config API, Init timing

---

## Session Scoping

| Option | Description | Selected |
|--------|-------------|----------|
| Per working directory | One session per cwd. Reused across stream() calls. Matches ARCHITECTURE.md. | ✓ |
| Per stream() call | New session every call. Simplest, no reuse. | |
| Single global session | One session for entire process. Maximum reuse. | |
| You decide | Claude picks based on GSD-2 patterns | |

**User's choice:** Per working directory
**Notes:** None

---

## Auth Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Fail fast with message | Clear error: 'Set CURSOR_API_KEY or run cursor-agent login'. No retry. | ✓ |
| Attempt CLI login | Try cursor-agent login automatically. May open browser. | |
| You decide | Claude picks appropriate behavior | |

**User's choice:** Fail fast with message
**Notes:** None

---

## Permission Config API

| Option | Description | Selected |
|--------|-------------|----------|
| Constructor option | Pass policy when creating session pool. Type-safe, explicit. | ✓ |
| Env var + constructor | CURSOR_PERMISSION_POLICY env var as default, overridable. | |
| You decide | Claude picks most ergonomic approach | |

**User's choice:** Constructor option
**Notes:** None

---

## Init Timing

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy (first request) | Init on first sendRequest. No startup cost. First call pays latency. | ✓ |
| Eager (pool creation) | Init immediately. Catches auth failures early. | |
| Eager with isReady() | Start eagerly, expose isReady(). Best of both. | |

**User's choice:** Lazy (first request)
**Notes:** None

---

## Claude's Discretion

- Session cleanup strategy
- Auth result caching
- PermissionHandler internal design
- Permission options array mapping

## Deferred Ideas

None
