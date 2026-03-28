---
status: partial
phase: 02-session-authentication
source: [02-VERIFICATION.md]
started: 2026-03-28T00:15:00Z
updated: 2026-03-28T00:15:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. CURSOR_API_KEY --api-key binaryArgs passthrough (AUTH-01)

expected: When CURSOR_API_KEY is set in the environment, AcpSessionPool constructs AcpTransport with binaryArgs `["--api-key", "<KEY>", "acp"]`. The transport process should receive the `--api-key` flag when spawned.

result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
