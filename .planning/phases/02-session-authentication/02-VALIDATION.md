---
phase: 2
slug: session-authentication
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x |
| **Config file** | `vitest.config.ts` (exists) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | AUTH-01 | unit | `npx vitest run src/session-pool.test.ts -t "initialize" -x` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | AUTH-01 | unit | `npx vitest run src/session-pool.test.ts -t "api-key" -x` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | AUTH-01 | unit | `npx vitest run src/session-pool.test.ts -t "fail-fast" -x` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 1 | AUTH-02 | unit | `npx vitest run src/permission-handler.test.ts -t "auto-respond" -x` | ❌ W0 | ⬜ pending |
| 02-01-05 | 01 | 1 | AUTH-02 | unit | `npx vitest run src/permission-handler.test.ts -t "optionId" -x` | ❌ W0 | ⬜ pending |
| 02-01-06 | 01 | 1 | AUTH-03 | unit | `npx vitest run src/permission-handler.test.ts -t "auto-approve-all" -x` | ❌ W0 | ⬜ pending |
| 02-01-07 | 01 | 1 | AUTH-03 | unit | `npx vitest run src/permission-handler.test.ts -t "approve-reads" -x` | ❌ W0 | ⬜ pending |
| 02-01-08 | 01 | 1 | AUTH-03 | unit | `npx vitest run src/permission-handler.test.ts -t "interactive" -x` | ❌ W0 | ⬜ pending |
| 02-01-09 | 01 | 1 | D-06 | unit | `npx vitest run src/session-pool.test.ts -t "reuse" -x` | ❌ W0 | ⬜ pending |
| 02-01-10 | 01 | 1 | D-09 | unit | `npx vitest run src/session-pool.test.ts -t "lazy" -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/session-pool.test.ts` — stubs for AUTH-01, D-06, D-09, transport restart recovery
- [ ] `src/permission-handler.test.ts` — stubs for AUTH-02, AUTH-03, all three policy modes
- No framework install needed — vitest already configured

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
