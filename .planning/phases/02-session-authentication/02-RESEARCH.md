# Phase 2: Session & Authentication - Research

**Researched:** 2026-03-27
**Domain:** ACP session lifecycle, authentication, permission handling
**Confidence:** HIGH

## Summary

Phase 2 builds the session layer on top of Phase 1's AcpTransport. The three deliverables are: (1) AcpSessionPool -- manages the ACP initialize/authenticate handshake lazily on first use and maintains a Map of cwd-to-sessionId for session reuse, (2) PermissionHandler -- auto-responds to `session/request_permission` server-initiated requests with configurable policy, and (3) authentication support via `CURSOR_API_KEY` env var or existing CLI login.

The ACP protocol flow is well-documented and the SDK at `@agentclientprotocol/sdk@^0.17.0` provides all necessary types: `InitializeRequest`, `AuthenticateRequest`, `NewSessionRequest`, `RequestPermissionRequest`, `RequestPermissionResponse`, `PermissionOption`, `PermissionOptionKind`, `ToolKind`, etc. The reference implementation in `context/cursor-agent-acp-npm/` provides battle-tested patterns for initialization, session management, and permission handling, though our implementation is simpler (client-side only, not agent-side).

**Primary recommendation:** Implement AcpSessionPool as a single class that composes AcpTransport, handles lazy init/auth, manages the cwd-to-session Map, and delegates permission requests to a PermissionHandler. Keep PermissionHandler as a standalone class for testability.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-06:** Sessions are scoped per working directory. One ACP session per unique cwd, reused across multiple stream() calls targeting the same directory. AcpSessionPool maintains a Map<cwd, sessionId> for lookup. New cwd -> new session via `session/new`. Same cwd -> reuse existing session via `session/prompt`.
- **D-07:** Fail fast with a clear error when authentication fails. If CURSOR_API_KEY is not set and Cursor CLI login hasn't been done, throw immediately with message: "Set CURSOR_API_KEY or run `cursor-agent login`". No automatic login attempts. No retry. Caller decides how to handle.
- **D-08:** Permission policy configured via constructor option on AcpSessionPool. Type-safe enum: `'auto-approve-all' | 'approve-reads-reject-writes' | 'interactive'`. Default: `'auto-approve-all'` (for subagent use). Passed down to PermissionHandler internally.
- **D-09:** Lazy initialization. ACP initialize/authenticate handshake happens on first request (first call to getOrCreateSession). No startup cost. First call pays the latency. AcpSessionPool constructor does not trigger any I/O.

### Claude's Discretion
- Internal session cleanup strategy (idle timeout, max sessions, etc.)
- Whether to cache the authentication result or re-check on each new session
- PermissionHandler internal design (class vs function, stateful vs stateless)
- How to handle the `session/request_permission` options array mapping to the three policy modes

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | Provider authenticates via `CURSOR_API_KEY` env var or existing Cursor CLI login | ACP authenticate flow documented; env var passed as `--api-key` arg to cursor-agent spawn; lazy init per D-09 |
| AUTH-02 | Provider auto-responds to `session/request_permission` with configurable policy (default: allow-once) | PermissionHandler maps ToolKind to outcomes; SDK types `RequestPermissionRequest`, `PermissionOption`, `PermissionOptionKind` available |
| AUTH-03 | Permission policy is configurable (auto-approve-all, approve-reads-reject-writes, interactive) | Constructor option per D-08; PermissionHandler switches on policy enum + ToolKind |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@agentclientprotocol/sdk` | ^0.17.0 | ACP type definitions (InitializeRequest, RequestPermissionRequest, PermissionOption, ToolKind, etc.) | Already installed; provides the canonical protocol types |
| `vitest` | ^3.0.0 | Test framework | Already configured in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | - | - | No additional dependencies needed -- all functionality is built on Phase 1's AcpTransport and Node.js built-ins |

**No new dependencies required.** AcpSessionPool composes AcpTransport (Phase 1), uses `@agentclientprotocol/sdk` types (already installed), and Node.js built-in `EventEmitter`.

## Architecture Patterns

### Recommended Project Structure
```
src/
  transport.ts           # Phase 1 (exists)
  types.ts               # Phase 1 (exists)
  errors.ts              # Phase 1 (exists)
  session-pool.ts        # NEW: AcpSessionPool class
  permission-handler.ts  # NEW: PermissionHandler class
  index.ts               # Updated: export new classes
```

### Pattern 1: Lazy Initialization with Mutex
**What:** AcpSessionPool defers the initialize/authenticate handshake until the first call to `getOrCreateSession()`. A simple promise-based mutex prevents concurrent callers from racing through init.
**When to use:** Always -- per D-09.
**Example:**
```typescript
// Source: ACP protocol docs + D-09
class AcpSessionPool {
  private transport: AcpTransport;
  private initPromise: Promise<void> | null = null;
  private initialized = false;
  private sessions = new Map<string, string>(); // cwd -> sessionId

  async getOrCreateSession(cwd: string): Promise<string> {
    await this.ensureInitialized();

    const existing = this.sessions.get(cwd);
    if (existing) return existing;

    const result = await this.transport.sendRequest("session/new", {
      cwd,
      mcpServers: [],
    }) as { sessionId: string };

    this.sessions.set(cwd, result.sessionId);
    return result.sessionId;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (!this.initPromise) {
      this.initPromise = this.doInitialize();
    }
    await this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    await this.transport.start();
    await this.transport.sendRequest("initialize", {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: "gsd-cursor", version: "0.0.1" },
    });
    await this.transport.sendRequest("authenticate", { methodId: "cursor_login" });
    this.initialized = true;
  }
}
```

### Pattern 2: Permission Handler with Policy Dispatch
**What:** PermissionHandler receives `session/request_permission` server-initiated requests, inspects the `toolCall.kind` field, and returns the appropriate `PermissionOptionId` based on the configured policy.
**When to use:** Every permission request from cursor-agent.
**Example:**
```typescript
// Source: ACP SDK types + reference permissions.ts
type PermissionPolicy = 'auto-approve-all' | 'approve-reads-reject-writes' | 'interactive';

class PermissionHandler {
  constructor(private policy: PermissionPolicy) {}

  resolvePermission(
    toolKind: ToolKind | undefined,
    options: PermissionOption[],
  ): RequestPermissionOutcome {
    switch (this.policy) {
      case 'auto-approve-all':
        return this.selectOption(options, 'allow_once');

      case 'approve-reads-reject-writes': {
        const isRead = toolKind === 'read' || toolKind === 'search' || toolKind === 'think' || toolKind === 'fetch';
        return this.selectOption(options, isRead ? 'allow_once' : 'reject_once');
      }

      case 'interactive':
        // Emit event, let caller handle; default to reject if no listener
        return { outcome: 'cancelled' };
    }
  }

  private selectOption(
    options: PermissionOption[],
    preferredKind: PermissionOptionKind,
  ): RequestPermissionOutcome {
    const option = options.find(o => o.kind === preferredKind);
    if (option) {
      return { outcome: 'selected', optionId: option.optionId };
    }
    // Fallback to first option
    return { outcome: 'selected', optionId: options[0].optionId };
  }
}
```

### Pattern 3: Authentication via Transport Args
**What:** Pass `CURSOR_API_KEY` as a command-line argument to the cursor-agent process at spawn time, rather than sending it over the protocol.
**When to use:** When CURSOR_API_KEY env var is set.
**Example:**
```typescript
// Source: cursor_acp.md authentication section
// "agent --api-key "$CURSOR_API_KEY" acp"
function buildTransportOptions(): TransportOptions {
  const apiKey = process.env.CURSOR_API_KEY;
  const args = apiKey
    ? ["--api-key", apiKey, "acp"]
    : ["acp"]; // relies on existing CLI login

  return { binaryArgs: args };
}
```

### Pattern 4: Event-Driven Permission Wiring
**What:** AcpSessionPool listens to AcpTransport's `request` event, filters for `session/request_permission` method, delegates to PermissionHandler, and sends the response back via `transport.sendResponse()`.
**When to use:** Always -- this is how the transport surfaces server-initiated requests.
**Example:**
```typescript
// Source: Phase 1 transport.ts event model
this.transport.on("request", (request: JsonRpcServerRequest) => {
  if (request.method === "session/request_permission") {
    const params = request.params as RequestPermissionRequest;
    const outcome = this.permissionHandler.resolvePermission(
      params.toolCall?.kind,
      params.options,
    );
    this.transport.sendResponse(request.id, { outcome });
  }
});
```

### Anti-Patterns to Avoid
- **Eager initialization in constructor:** D-09 explicitly says no I/O in constructor. All async work happens on first `getOrCreateSession()`.
- **Re-initializing on every session:** The initialize/authenticate handshake happens once per transport lifetime. Cache the result. Only re-init if the transport process crashes and restarts.
- **Ignoring the options array in permission requests:** The ACP protocol sends available `PermissionOption[]` with specific `optionId` values. Do NOT hardcode `"allow-once"` -- find the option by `kind` and return its actual `optionId`.
- **Blocking permission responses:** If permission handling blocks (e.g., waiting for interactive user input), the entire cursor-agent session stalls. For `interactive` mode, implement a timeout or event-based approach.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ACP types | Custom type definitions for ACP messages | `@agentclientprotocol/sdk` types | SDK provides `InitializeRequest`, `AuthenticateRequest`, `NewSessionRequest`, `RequestPermissionRequest`, `PermissionOption`, `ToolKind`, etc. |
| JSON-RPC framing | Custom stdio protocol | `AcpTransport` from Phase 1 | Already built and tested |
| UUID generation | Custom session ID generation | Not needed -- cursor-agent generates sessionIds, we just store them | The `session/new` response contains the `sessionId` |

## Common Pitfalls

### Pitfall 1: Race Condition on Lazy Init
**What goes wrong:** Two concurrent `getOrCreateSession()` calls both see `initialized === false` and both attempt to run `initialize` + `authenticate`, causing a protocol error (double init).
**Why it happens:** Without a mutex, the check-then-act pattern is not atomic in async code.
**How to avoid:** Use a shared `initPromise`. First caller creates it; subsequent callers await the same promise.
**Warning signs:** Intermittent "already initialized" errors from cursor-agent on concurrent startup.

### Pitfall 2: Hardcoding Permission Option IDs
**What goes wrong:** Code responds with `{ outcome: "selected", optionId: "allow-once" }` but the actual option ID from cursor-agent might be different (e.g., `"allow_once_1"` or a UUID).
**Why it happens:** The ACP minimal example in the docs uses `"allow-once"` as the optionId, which looks like a constant.
**How to avoid:** Always find the option by `kind` (e.g., `"allow_once"`) from the `options[]` array, then use its actual `optionId`.
**Warning signs:** Permission responses being rejected by cursor-agent.

### Pitfall 3: Not Passing API Key as CLI Argument
**What goes wrong:** Code sets CURSOR_API_KEY but passes it through the `authenticate` method instead of as a CLI argument. The `authenticate` method with `methodId: "cursor_login"` expects the user to already be logged in or the key to be passed at spawn time.
**Why it happens:** The ACP docs show `authenticate` as a protocol step, which suggests auth happens at the protocol level.
**How to avoid:** Pass `--api-key` as an argument to the cursor-agent spawn: `agent --api-key "$KEY" acp`. The `authenticate` call then succeeds because the agent was started with credentials.
**Warning signs:** Authentication failures despite CURSOR_API_KEY being set.

### Pitfall 4: Session Leak on Error
**What goes wrong:** A `session/new` succeeds and returns a sessionId, but the subsequent `session/prompt` fails. The session is stored in the Map but never cleaned up.
**Why it happens:** Error path doesn't remove the session from the map.
**How to avoid:** Track session health. Consider removing a session from the map if its creation is partial (new succeeded but first prompt failed). Or accept sessions may be stale and handle gracefully.
**Warning signs:** Accumulating orphan sessions over time.

### Pitfall 5: Transport Restart Invalidates Sessions
**What goes wrong:** After a transport crash+restart (Phase 1's auto-restart logic), all cached sessionIds are invalid because the new cursor-agent process doesn't know about them.
**Why it happens:** Sessions are scoped to the cursor-agent process lifetime, not the AcpTransport object.
**How to avoid:** Listen for the transport's `restarting` event. Clear the initialized flag and the sessions Map. Next `getOrCreateSession()` call will re-initialize and create new sessions.
**Warning signs:** "Session not found" errors after a process restart.

## Code Examples

### ACP Initialize + Authenticate Flow
```typescript
// Source: cursor_acp.md minimal client example
// Protocol version 1, no fs/terminal capabilities (we're a subagent, not an editor)
await transport.sendRequest("initialize", {
  protocolVersion: 1,
  clientCapabilities: {
    fs: { readTextFile: false, writeTextFile: false },
    terminal: false,
  },
  clientInfo: { name: "gsd-cursor", version: "0.0.1" },
});

// "cursor_login" is the only auth method Cursor CLI supports
await transport.sendRequest("authenticate", { methodId: "cursor_login" });
```

### Session New + Prompt
```typescript
// Source: cursor_acp.md
const { sessionId } = await transport.sendRequest("session/new", {
  cwd: "/path/to/project",
  mcpServers: [],
}) as { sessionId: string };

const result = await transport.sendRequest("session/prompt", {
  sessionId,
  prompt: [{ type: "text", text: "Hello" }],
});
// result.stopReason tells why the model stopped
```

### Permission Response Format
```typescript
// Source: @agentclientprotocol/sdk types
// RequestPermissionResponse = { outcome: RequestPermissionOutcome }
// RequestPermissionOutcome = { outcome: "cancelled" } | { outcome: "selected", optionId: string }

// Correct: find option by kind, use its actual optionId
const allowOption = params.options.find(o => o.kind === "allow_once");
transport.sendResponse(request.id, {
  outcome: allowOption
    ? { outcome: "selected", optionId: allowOption.optionId }
    : { outcome: "cancelled" },
});
```

### ToolKind Values for Permission Decisions
```typescript
// Source: @agentclientprotocol/sdk types.gen.d.ts
// ToolKind = "read" | "edit" | "delete" | "move" | "search" | "execute" | "think" | "fetch" | "switch_mode" | "other"

// Read-safe kinds: "read", "search", "think", "fetch"
// Write/dangerous kinds: "edit", "delete", "move", "execute"
// Neutral: "switch_mode", "other"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ACP SDK 0.5.x types | ACP SDK 0.17.x types | Recent | SDK types are substantially richer; `ToolKind` now includes `"switch_mode"`, `"think"`, `"fetch"` |
| `PermissionOption.kind` values were strings | Now typed as `PermissionOptionKind = "allow_once" \| "allow_always" \| "reject_once" \| "reject_always"` | SDK 0.17.x | Type-safe permission option matching |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.x |
| Config file | `vitest.config.ts` (exists) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | AcpSessionPool lazy init sends initialize + authenticate on first getOrCreateSession | unit | `npx vitest run src/session-pool.test.ts -t "initialize" -x` | Wave 0 |
| AUTH-01 | CURSOR_API_KEY passed as --api-key arg to transport options | unit | `npx vitest run src/session-pool.test.ts -t "api-key" -x` | Wave 0 |
| AUTH-01 | Fail-fast when no auth available | unit | `npx vitest run src/session-pool.test.ts -t "fail-fast" -x` | Wave 0 |
| AUTH-02 | PermissionHandler auto-responds to session/request_permission | unit | `npx vitest run src/permission-handler.test.ts -t "auto-respond" -x` | Wave 0 |
| AUTH-02 | Permission response uses correct optionId from options array | unit | `npx vitest run src/permission-handler.test.ts -t "optionId" -x` | Wave 0 |
| AUTH-03 | auto-approve-all approves everything | unit | `npx vitest run src/permission-handler.test.ts -t "auto-approve-all" -x` | Wave 0 |
| AUTH-03 | approve-reads-reject-writes approves reads, rejects edits | unit | `npx vitest run src/permission-handler.test.ts -t "approve-reads" -x` | Wave 0 |
| AUTH-03 | interactive mode returns cancelled (or emits event) | unit | `npx vitest run src/permission-handler.test.ts -t "interactive" -x` | Wave 0 |
| D-06 | Sessions scoped per cwd, reused on repeat calls | unit | `npx vitest run src/session-pool.test.ts -t "reuse" -x` | Wave 0 |
| D-09 | Constructor does no I/O, init deferred to first call | unit | `npx vitest run src/session-pool.test.ts -t "lazy" -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/session-pool.test.ts` -- covers AUTH-01, D-06, D-09, transport restart recovery
- [ ] `src/permission-handler.test.ts` -- covers AUTH-02, AUTH-03, all three policy modes
- [ ] No framework install needed -- vitest already configured

## Open Questions

1. **Interactive mode UX**
   - What we know: The `interactive` policy means permission requests should be surfaced to the user.
   - What's unclear: In a subagent context, there may be no interactive user. AcpSessionPool could emit an event, but if no listener is attached, the request would hang.
   - Recommendation: For `interactive` mode, emit an event with a timeout. If no response within 30s, default to `cancelled`. Document this behavior. This is low priority since the default is `auto-approve-all`.

2. **Session cleanup timing**
   - What we know: Sessions are cached in a Map. Cursor-agent process may accumulate memory for each session.
   - What's unclear: How many concurrent sessions cursor-agent can handle; whether `session/close` exists.
   - Recommendation: Implement a simple max-sessions limit (e.g., 10). When exceeded, remove the least-recently-used session from the Map. Do NOT actively close sessions with cursor-agent (the ACP spec's `close_session` method is available but adds complexity). Let the cursor-agent process manage its own session memory. If the user reports memory issues, add active session closing in a later phase.

## Sources

### Primary (HIGH confidence)
- `context/cursor_acp.md` -- ACP protocol documentation (request flow, authentication, permissions, session lifecycle)
- `@agentclientprotocol/sdk@^0.17.0` types (`types.gen.d.ts`) -- Type definitions for all ACP messages, verified by reading actual installed package
- `context/cursor-agent-acp-npm/src/protocol/permissions.ts` -- Reference PermissionHandler implementation (tool-kind-based defaults, option validation)
- `context/cursor-agent-acp-npm/src/protocol/initialization.ts` -- Reference initialization handler (version negotiation, capability building)
- `context/cursor-agent-acp-npm/src/session/manager.ts` -- Reference session management (creation, cleanup, mode/model tracking)

### Secondary (MEDIUM confidence)
- `context/gsd-2/packages/pi-ai/src/env-api-keys.ts` -- GSD-2 pattern for env var API key resolution
- `.planning/research/ARCHITECTURE.md` -- Architecture patterns, component boundaries, data flow

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All dependencies already installed, types verified from SDK source
- Architecture: HIGH - ACP protocol well-documented, reference implementation available, patterns match D-06 through D-09
- Pitfalls: HIGH - Race conditions, option ID handling, and transport restart are well-understood from reference code analysis

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable -- ACP SDK and Cursor CLI protocol unlikely to change in 30 days)
