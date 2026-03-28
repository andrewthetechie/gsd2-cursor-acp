---
phase: 3
slug: provider-streaming
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | none — vitest defaults (`package.json` `"test": "vitest run"`) |
| **Quick run command** | `npm run typecheck && npm test -- --reporter=verbose` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run typecheck && npm test -- --reporter=verbose`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 0 | STRM-01, STRM-02, STRM-03 | unit stubs | `npm test -- --reporter=verbose src/event-translator.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 0 | PROV-02, STRM-04 | unit stubs | `npm test -- --reporter=verbose src/provider.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 0 | PROV-03 | unit stubs | `npm test -- --reporter=verbose src/register.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-04 | 01 | 1 | STRM-01 | unit | `npm test -- --reporter=verbose src/event-translator.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-05 | 01 | 1 | STRM-02 | unit | `npm test -- --reporter=verbose src/event-translator.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-06 | 01 | 1 | STRM-03 | unit | `npm test -- --reporter=verbose src/event-translator.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | PROV-01 | type check | `npm run typecheck` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | PROV-02 | unit | `npm test -- --reporter=verbose src/provider.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 | 1 | STRM-04 | unit | `npm test -- --reporter=verbose src/provider.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-04 | 02 | 2 | PROV-03 | unit | `npm test -- --reporter=verbose src/register.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/event-translator.test.ts` — stubs for STRM-01, STRM-02, STRM-03
- [ ] `src/provider.test.ts` — stubs for PROV-02, STRM-04
- [ ] `src/register.test.ts` — stubs for PROV-03
- [ ] Test framework (Vitest 3.x) already installed — no install step needed

*Wave 0 must create all three test files with skipped/pending stubs before any implementation begins.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `session/cancel` sent to real ACP on abort | STRM-04 | Requires live Cursor CLI process | Spawn real ACP process, trigger abort mid-stream, verify cursor agent acp receives cancel |
| Correct `mode: 'agent'` enables tool/thinking notifications | STRM-02, STRM-03 | Requires live Cursor CLI with real model | Run stream() against real ACP, verify tool call and thinking events arrive |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
