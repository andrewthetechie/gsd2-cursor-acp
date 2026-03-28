---
phase: 1
slug: acp-transport
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 0 | — | setup | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | TRAN-01 | unit | `npx vitest run src/transport.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | TRAN-02 | unit | `npx vitest run src/transport.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 1 | TRAN-03 | unit | `npx vitest run src/transport.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `package.json` — project init with dependencies (@agentclientprotocol/sdk, vitest, typescript)
- [ ] `tsconfig.json` — TypeScript configuration
- [ ] `src/` — source directory structure
- [ ] `vitest.config.ts` — test framework configuration

*Greenfield repo — Wave 0 sets up all project scaffolding.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| cursor-agent process spawns | TRAN-01 | Requires cursor-agent binary installed | Run integration test with real binary |
| Process survives across calls | TRAN-02 | Requires real process lifecycle | Monitor PID across multiple requests |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
