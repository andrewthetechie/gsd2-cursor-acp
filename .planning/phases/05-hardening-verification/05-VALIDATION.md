---
phase: 5
slug: hardening-verification
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --reporter=verbose src/integration.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~21 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test && npm run typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green + typecheck clean
- **Max feedback latency:** ~21 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | ERRH-01, ERRH-02, ERRH-03 | unit | `npm test -- errors.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | ERRH-01 | unit | `npm test -- register.test.ts` | exists (gap: new cases) | ⬜ pending |
| 05-01-03 | 01 | 1 | ERRH-02 | unit | `npm test -- session-pool.test.ts` | exists (gap: new cases) | ⬜ pending |
| 05-01-04 | 01 | 1 | ERRH-03 | unit | `npm test -- provider.test.ts` | exists (gap: new cases) | ⬜ pending |
| 05-02-01 | 02 | 2 | TEST-02 | integration | `npm test -- integration.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 2 | TEST-01 | unit | `npm test` | exists | ⬜ pending |
| 05-02-03 | 02 | 2 | TEST-03 | manual | n/a — README.md, TSDoc, TESTING.md review | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__fixtures__/mock-acp-server.mjs` — mock ACP subprocess for integration tests (TEST-02); must be plain ESM JavaScript (tsx not installed)
- [ ] `src/integration.test.ts` — stub file covering all four integration paths (happy path, auth error, session error, CLI not found)
- [ ] Additional test cases in `src/register.test.ts` for `CursorCliNotFoundError` throw (ERRH-01)
- [ ] Additional test cases in `src/session-pool.test.ts` for `CursorAuthError` class, `cause` field, retry behavior (ERRH-02)
- [ ] Additional test cases in `src/provider.test.ts` for `CursorSessionError` mapping to GSD-2 `error` event (ERRH-03)
- [ ] `README.md` — project root (TEST-03)
- [ ] `TESTING.md` — project root (TEST-03)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| README.md is accurate and complete | TEST-03 | Documentation quality is subjective | Read README.md; verify installation, configuration, and usage example sections exist and are accurate |
| TSDoc renders correctly in IDE | TEST-03 | IDE tooling required | Open VS Code, hover over exported symbols from `index.ts`, verify doc comments appear |
| TESTING.md matches actual test structure | TEST-03 | Prose accuracy requires human review | Read TESTING.md; verify each described file exists and commands run successfully |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
