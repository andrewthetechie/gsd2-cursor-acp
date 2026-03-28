# Phase 3: Provider & Streaming - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 03-provider-streaming
**Areas discussed:** Context → ACP mapping, CWD sourcing, Session mode, ThinkingLevel handling

---

## Context → ACP Mapping

| Option | Description | Selected |
|--------|-------------|----------|
| Latest user message only | Send only the last user message; ACP session maintains history | ✓ |
| Full history as text | Flatten all messages to a single text block with role prefixes | |
| Full history as separate blocks | Send each message as its own ContentBlock | |

**User's choice:** Latest user message only
**Notes:** ACP sessions maintain their own conversation state; sending full history would double-count prior turns.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Prepend systemPrompt on first call only | Inject as first ContentBlock for new sessions only | ✓ |
| Prepend to every session/prompt | Include on every call | |
| Ignore it | Skip systemPrompt entirely | |

**User's choice:** Prepend on first call only
**Notes:** Once the session has context, repeating the system prompt is redundant.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Skip tool results | Don't include ToolResultMessage entries in ACP prompt | ✓ |
| Flatten to text | Serialize as text blocks | |
| Claude's discretion | Let implementation decide | |

**User's choice:** Skip them
**Notes:** ACP sessions handle tool calls internally; GSD-2 tool results are from a different execution model.

---

## CWD Sourcing

| Option | Description | Selected |
|--------|-------------|----------|
| process.cwd() | Use calling process's current directory | ✓ |
| Custom options field | Add cwd to provider-specific options | |
| Constructor option with fallback | Accept cwd on constructor, default to process.cwd() | |

**User's choice:** process.cwd()
**Notes:** Correct for CLI/subagent use where cwd is set before calling the provider.

---

## Session Mode

| Option | Description | Selected |
|--------|-------------|----------|
| agent | Full tool access + streaming session/update notifications | ✓ |
| ask | Q&A only, no tool use | |
| Claude's discretion | Let implementation determine from ACP spec | |

**User's choice:** agent
**Notes:** Required for STRM-02 (tool call events) and STRM-03 (thinking content).

---

| Option | Description | Selected |
|--------|-------------|----------|
| Explicitly pass mode: 'agent' | Update AcpSessionPool with sessionMode option (default: 'agent') | ✓ |
| Leave unspecified | Don't pass mode, rely on Cursor CLI default | |

**User's choice:** Explicitly pass mode: 'agent'
**Notes:** Makes intent clear; future-proof for plan/ask modes.

---

## ThinkingLevel Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Ignore it for now | Accept field but don't act on it; Phase 4 handles this | ✓ |
| Pass model.id to Cursor as-is | Let Phase 4 define model ID mapping | |
| Warn if non-null and ignore | Log debug warning when reasoning is set | |

**User's choice:** Ignore it for now
**Notes:** Phase 4 (model discovery) wires up ThinkingLevel-to-Cursor-model mapping.

---

## Claude's Discretion

- EventTranslator internal design (pure functions vs class vs generator)
- Partial AssistantMessage state management during streaming
- Stream-end signal detection from ACP
- Usage object population (likely zeros for Phase 3)
- AbortSignal → session/cancel wiring

## Deferred Ideas

None — discussion stayed within phase scope.
