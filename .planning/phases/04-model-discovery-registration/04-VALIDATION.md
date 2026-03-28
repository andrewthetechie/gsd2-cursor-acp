---
phase: 4
slug: model-discovery-registration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --reporter=dot` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --reporter=dot`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | MODL-01 | unit | `npm test -- --reporter=dot src/register.test.ts` | exists (extend) | pending |
| 4-01-02 | 01 | 1 | MODL-01 | unit | `npm test -- --reporter=dot src/register.test.ts` | exists (extend) | pending |
| 4-01-03 | 01 | 1 | MODL-02 | unit | `npm test -- --reporter=dot src/register.test.ts` | exists (extend) | pending |
| 4-01-04 | 01 | 1 | MODL-02 | unit | `npm test -- --reporter=dot src/register.test.ts` | exists (extend) | pending |
| 4-01-05 | 01 | 1 | MODL-03 | unit | `npm test -- --reporter=dot src/register.test.ts` | exists (extend) | pending |
| 4-01-06 | 01 | 1 | MODL-03 | unit | `npm test -- --reporter=dot src/register.test.ts` | exists (extend) | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. `src/register.test.ts` already exists and will be extended. No new test files need to be created — only `vi.mock('node:child_process')` needs to be added to the existing test file.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Actual `cursor-agent --list-models` output parsing | MODL-01 | Requires unlocked macOS keychain and Cursor auth | Run `cursor-agent --list-models 2>/dev/null \| cat` after keychain unlock; verify parser returns non-empty model list |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
