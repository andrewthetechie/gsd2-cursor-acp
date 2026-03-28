# Phase 1: ACP Transport - Research

**Researched:** 2026-03-27
**Domain:** JSON-RPC 2.0 over stdio, Node.js child process management, ACP protocol transport layer
**Confidence:** HIGH

## Summary

Phase 1 delivers the `AcpTransport` class -- the lowest layer of the stack that spawns a single `cursor-agent acp` child process and manages bidirectional JSON-RPC 2.0 communication over stdio. The transport must handle three message categories: outgoing requests (with ID correlation to responses), incoming notifications (no ID, routed by method name), and server-initiated requests (with ID, requiring a response back -- e.g., `session/request_permission`).

The ACP protocol uses newline-delimited JSON-RPC 2.0. Each message is a single JSON object terminated by `\n`. The official Cursor ACP documentation provides a minimal Node.js client example that demonstrates the exact pattern: `spawn("agent", ["acp"])`, `readline.createInterface` on stdout, a pending Map for request/response correlation, and a `respond()` function for server-initiated requests. This phase implements exactly this pattern as a reusable class, plus process lifecycle management (auto-restart on crash, graceful shutdown).

**Primary recommendation:** Implement AcpTransport as an EventEmitter subclass with `sendRequest()`, `sendResponse()`, `start()`, `shutdown()` methods. Use Node.js `readline` for line parsing (proven in the official ACP example). Use a monotonically incrementing integer for request IDs. Keep the class focused solely on JSON-RPC framing and process lifecycle -- no session logic, no ACP method knowledge.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** This repo (gsd-cursor) IS the package. Ships as a standalone npm module (e.g., `@gsd/pi-ai-cursor-acp`). `@gsd/pi-ai` types are a peer dependency. Not inside the GSD-2 monorepo.
- **D-02:** Use `@agentclientprotocol/sdk` for ACP types (InitializeRequest, InitializeResponse, ClientCapabilities, etc.). Keeps types in sync with the ACP protocol spec.
- **D-03:** On unexpected process crash/exit, auto-restart once. Re-initialize ACP handshake. If second crash occurs within 30 seconds, fail and surface error to caller.
- **D-04:** On host exit (Node.js shutdown), send SIGTERM to cursor-agent process, wait up to 5 seconds for clean exit, then SIGKILL.
- **D-05:** Target `cursor-agent` binary (not `cursor agent` subcommand). This is the dedicated agent CLI binary.

### Claude's Discretion
- JSON-RPC message framing details (buffer handling, partial line parsing, max message size)
- Internal error types and error propagation patterns
- Test structure and mock strategies for the transport layer
- Whether to use Node.js `readline` or manual newline splitting for stdout parsing

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRAN-01 | ACP transport sends and receives JSON-RPC messages over stdio to `cursor agent acp` child process | Official ACP docs provide minimal client example; `readline` + `stdin.write` pattern confirmed. JSON-RPC 2.0 spec defines message structure. |
| TRAN-02 | Transport manages long-lived child process (spawn once, reuse across requests) | Architecture patterns confirm single-process model. D-03/D-04 define restart and shutdown behavior. |
| TRAN-03 | Transport correlates JSON-RPC requests/responses by message ID | Official ACP example uses `pending = new Map()` with numeric IDs. Three message types identified: responses (has id + result/error), notifications (has method, no id), server requests (has method + id). |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@agentclientprotocol/sdk` | 0.17.x | ACP type definitions (RequestId, Error, InitializeRequest, etc.) | D-02 locked decision; keeps types in sync with ACP spec |
| `typescript` | 5.7.x | Language | GSD-2 ecosystem standard; Node 24 compatible |
| `node:child_process` | built-in | Process spawning (`spawn`) | Standard Node.js API for stdio child processes |
| `node:readline` | built-in | Line-delimited parsing of stdout | Used in official ACP minimal client example; handles partial buffer assembly correctly |
| `node:events` | built-in | EventEmitter for notification routing | Standard Node.js pattern for event-based APIs |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | 3.x | Test framework | Unit tests for transport; fast, TypeScript-native, no config overhead |
| `tsup` | 8.x | Build/bundle | Simple ESM build from TypeScript; single entry point |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `readline` | Manual buffer splitting | Manual approach handles edge cases (partial lines) the same way but requires more code; readline is battle-tested |
| `vitest` | `jest` | Jest used by reference adapter; vitest is lighter, faster startup, native ESM/TS support |
| `tsup` | `tsc` only | tsc works but tsup bundles cleanly for npm distribution |

**Installation:**
```bash
npm install @agentclientprotocol/sdk
npm install -D typescript vitest tsup @types/node
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  transport.ts          # AcpTransport class
  types.ts              # Transport-specific types (TransportOptions, TransportError, etc.)
  errors.ts             # Error classes (TransportError, ProcessCrashError, etc.)
  index.ts              # Public API exports
tests/
  transport.test.ts     # Unit tests with mock child process
  transport.integration.test.ts  # Integration test with real cursor-agent (optional)
```

### Pattern 1: EventEmitter-Based Transport
**What:** AcpTransport extends EventEmitter. Emits typed events for notifications and server-initiated requests. Returns Promises for request/response correlation.
**When to use:** Always -- this is the pattern for Phase 1.
**Example:**
```typescript
// Source: Derived from official ACP minimal client (context/cursor_acp.md)
import { EventEmitter } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface, type Interface } from "node:readline";

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

class AcpTransport extends EventEmitter {
  private process: ChildProcess | null = null;
  private rl: Interface | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();

  async sendRequest(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const message = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });
    this.process!.stdin!.write(message + "\n");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request ${method} timed out`));
      }, this.requestTimeout);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  sendResponse(id: number | string, result: unknown): void {
    const message = JSON.stringify({
      jsonrpc: "2.0",
      id,
      result,
    });
    this.process!.stdin!.write(message + "\n");
  }

  private handleLine(line: string): void {
    const msg = JSON.parse(line);

    if (msg.id !== undefined && (msg.result !== undefined || msg.error)) {
      // Response to our request
      const waiter = this.pending.get(msg.id);
      if (waiter) {
        clearTimeout(waiter.timer);
        this.pending.delete(msg.id);
        msg.error ? waiter.reject(msg.error) : waiter.resolve(msg.result);
      }
      return;
    }

    if (msg.method && msg.id !== undefined) {
      // Server-initiated request (e.g., session/request_permission)
      this.emit("request", msg);
      return;
    }

    if (msg.method) {
      // Notification (e.g., session/update)
      this.emit("notification", msg);
      return;
    }
  }
}
```

### Pattern 2: Auto-Restart with Crash Window (D-03)
**What:** Track last crash time. On first unexpected exit, restart and re-emit a "restarting" event. On second crash within 30 seconds, reject all pending requests and emit "fatal" error.
**When to use:** Always -- locked decision D-03.
**Example:**
```typescript
private lastCrashTime: number | null = null;
private crashCount = 0;
private static readonly CRASH_WINDOW_MS = 30_000;

private handleProcessExit(code: number | null, signal: string | null): void {
  // Expected shutdown -- don't restart
  if (this.shuttingDown) return;

  const now = Date.now();

  // Reset crash count if outside window
  if (this.lastCrashTime && (now - this.lastCrashTime) > AcpTransport.CRASH_WINDOW_MS) {
    this.crashCount = 0;
  }

  this.crashCount++;
  this.lastCrashTime = now;

  if (this.crashCount >= 2) {
    // Fatal -- reject all pending, emit error
    this.rejectAllPending(new ProcessCrashError("Process crashed twice within 30s"));
    this.emit("error", new ProcessCrashError("Process crashed twice within 30s"));
    return;
  }

  // Auto-restart once
  this.emit("restarting");
  this.spawnProcess();
}
```

### Pattern 3: Graceful Shutdown (D-04)
**What:** On shutdown, send SIGTERM, wait 5s, then SIGKILL. Register cleanup on process exit signals.
**When to use:** Always -- locked decision D-04.
**Example:**
```typescript
async shutdown(): Promise<void> {
  this.shuttingDown = true;

  // Reject all pending requests
  this.rejectAllPending(new Error("Transport shutting down"));

  if (!this.process || this.process.killed) return;

  this.process.kill("SIGTERM");

  await Promise.race([
    new Promise<void>((resolve) => this.process!.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(() => {
      if (this.process && !this.process.killed) {
        this.process.kill("SIGKILL");
      }
      resolve();
    }, 5000)),
  ]);
}
```

### Anti-Patterns to Avoid
- **Parsing JSON-RPC in the consumer:** Transport should fully parse and route messages internally. Consumers receive typed events, never raw strings.
- **Using `data` event instead of `readline`:** The `data` event provides arbitrary chunks, not complete lines. A single JSON message might arrive across multiple chunks. `readline` handles this correctly.
- **Storing request ID as string internally:** Use numeric IDs for internal tracking (Map key). Convert to/from ACP `RequestId` (bigint | string | null) only at the boundary.
- **Ignoring stderr:** Cursor writes diagnostic logs to stderr. Capture and forward to debug logging, but do NOT parse as JSON-RPC.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Line-delimited parsing | Custom buffer + split logic | `node:readline` createInterface | Handles partial lines, backpressure, encoding correctly. Official ACP example uses it. |
| ACP type definitions | Custom TypeScript interfaces | `@agentclientprotocol/sdk` types | D-02 locked decision. SDK types stay in sync with protocol spec. |
| JSON-RPC error codes | Custom error code constants | Import from SDK or define the standard codes (-32700, -32600, -32601, -32602, -32603) | JSON-RPC 2.0 error codes are standardized; reference adapter shows the pattern. |

**Key insight:** The ACP transport layer is simple by design (newline-delimited JSON over stdio). The complexity is in message routing and process lifecycle, not in the protocol framing itself. Keep the framing thin and invest in robust error handling and state management.

## Common Pitfalls

### Pitfall 1: Response Without Matching Request
**What goes wrong:** Server sends a response with an ID that doesn't match any pending request (e.g., timed-out request, duplicate response).
**Why it happens:** Network/process delays, or a bug in ID tracking.
**How to avoid:** Always check `pending.has(id)` before accessing. Log a warning and discard unmatched responses.
**Warning signs:** Unhandled promise rejections, memory leaks in the pending Map.

### Pitfall 2: JSON Parse Errors on Partial Lines
**What goes wrong:** Attempting to parse incomplete JSON or non-JSON lines from stdout.
**Why it happens:** Process startup might emit non-JSON output, or a very large message could theoretically contain newlines in string values (though ACP spec says one message per line).
**How to avoid:** Wrap `JSON.parse` in try/catch. Log and skip unparseable lines. Trust that `readline` gives complete lines.
**Warning signs:** Repeated parse errors in logs.

### Pitfall 3: Zombie Process on Unhandled Exit
**What goes wrong:** Node.js exits without killing the child process, leaving `cursor-agent` running.
**Why it happens:** Forgetting to register `process.on("exit")` and `process.on("SIGTERM")` handlers for cleanup.
**How to avoid:** Register cleanup handlers in `start()`. Use D-04's SIGTERM + 5s + SIGKILL pattern. Also register `beforeExit`, `SIGINT`, `SIGTERM` on the host process.
**Warning signs:** Multiple `cursor-agent` processes visible in `ps aux` after tests.

### Pitfall 4: Memory Leak in Pending Requests Map
**What goes wrong:** Requests that never receive a response accumulate in the Map.
**Why it happens:** Process crash before responding, or a method that legitimately never responds.
**How to avoid:** Set a request timeout (e.g., 60s default). On process crash, reject all pending requests immediately.
**Warning signs:** Growing memory usage over time, pending Map size increasing.

### Pitfall 5: Confusing Server Requests with Notifications
**What goes wrong:** `session/request_permission` is treated as a notification and never responded to, causing cursor-agent to hang.
**Why it happens:** Both have a `method` field. The difference is that server requests also have an `id` field, requiring a response.
**How to avoid:** The routing logic MUST check: (1) has `id` + has `result`/`error` = response to our request, (2) has `method` + has `id` = server-initiated request (needs response), (3) has `method` + no `id` = notification.
**Warning signs:** cursor-agent hangs during tool execution.

### Pitfall 6: ACP SDK RequestId Type Mismatch
**What goes wrong:** ACP SDK uses `RequestId = null | bigint | string`, but JSON.parse returns numbers (not bigint) for numeric IDs.
**Why it happens:** JSON spec has no bigint type; `JSON.parse` produces `number`.
**How to avoid:** Use plain `number` for internal request ID tracking. Only convert to/from `RequestId` when interfacing with ACP SDK types. The reference adapter's `toRequestId()` function shows this pattern.
**Warning signs:** Type errors when comparing request IDs.

## Code Examples

Verified patterns from official sources:

### Spawning cursor-agent acp
```typescript
// Source: context/cursor_acp.md (official ACP docs) + D-05 (cursor-agent binary)
import { spawn } from "node:child_process";

const agent = spawn("cursor-agent", ["acp"], {
  stdio: ["pipe", "pipe", "inherit"], // stdin=pipe, stdout=pipe, stderr=inherit
});
```

Note: The official example uses `agent` as the binary name, but D-05 specifies `cursor-agent` for this project. `stderr` is set to `inherit` so cursor diagnostic output goes to the host process stderr.

### Reading Lines from stdout
```typescript
// Source: context/cursor_acp.md (official ACP docs)
import readline from "node:readline";

const rl = readline.createInterface({ input: agent.stdout });
rl.on("line", (line) => {
  const msg = JSON.parse(line);
  // Route based on message type...
});
```

### Sending a JSON-RPC Request
```typescript
// Source: context/cursor_acp.md (official ACP docs)
function send(method: string, params: unknown): Promise<unknown> {
  const id = nextId++;
  agent.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"
  );
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
```

### Responding to Server-Initiated Requests
```typescript
// Source: context/cursor_acp.md (official ACP docs)
function respond(id: number | string, result: unknown): void {
  agent.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n"
  );
}

// Example: responding to session/request_permission
// respond(msg.id, { outcome: { outcome: "selected", optionId: "allow-once" } });
```

### JSON-RPC Error Codes
```typescript
// Source: context/cursor-agent-acp-npm/src/utils/json-rpc.ts
const JsonRpcErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@zed-industries/agent-client-protocol` | `@agentclientprotocol/sdk` | 2025-2026 | Package renamed/migrated to official ACP org |
| ACP SDK 0.5.x | ACP SDK 0.17.x | Ongoing | Rapid iteration; types may change between minor versions |
| `cursor agent acp` (subcommand) | `cursor-agent acp` (binary) + `agent acp` (binary) | 2025 | Dedicated binary, per D-05 use `cursor-agent` |

**Deprecated/outdated:**
- `@zed-industries/agent-client-protocol`: Replaced by `@agentclientprotocol/sdk`. Users should migrate.
- ACP SDK < 0.10: Significant type changes from early versions. Use latest 0.17.x.

## Open Questions

1. **Exact ACP SDK exports for this use case**
   - What we know: SDK v0.17.x provides `ClientSideConnection`, `AgentSideConnection`, and various type exports. The reference adapter imports `InitializeRequest`, `InitializeResponse`, `AgentCapabilities`, `ClientCapabilities`, `AuthMethod`, `Implementation`, `RequestId`, `Error` from the SDK.
   - What's unclear: Whether we should use `ClientSideConnection` directly (it may handle transport/framing for us) or just import types and build our own transport.
   - Recommendation: Start with just importing types (matching the reference adapter pattern). `ClientSideConnection` may add abstraction we don't need. Evaluate during implementation -- if it provides a clean stdio transport, use it; otherwise, our custom transport is simple enough.

2. **`cursor-agent` binary path resolution**
   - What we know: `cursor-agent` is installed at `~/.local/bin/cursor-agent` on this machine. The official docs show `agent acp` as the command.
   - What's unclear: Whether `cursor-agent` is always in PATH, or if we need a configurable binary path.
   - Recommendation: Default to `cursor-agent` in PATH. Accept an optional `binaryPath` config for non-standard installs. Fail with a clear error if binary not found (ENOENT).

3. **Maximum message size / backpressure**
   - What we know: ACP uses newline-delimited JSON. No documented max message size.
   - What's unclear: Whether cursor-agent can send very large messages (e.g., file contents in tool results) that could cause memory pressure.
   - Recommendation: No artificial limit. Let Node.js readline handle buffering. Monitor in integration tests.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `cursor-agent` | Process spawning | Yes | 2.6.21 | -- |
| Node.js | Runtime | Yes | v24.13.1 | -- |
| npm | Package management | Yes | 11.8.0 | -- |
| TypeScript | Build | No (dev dep, to be installed) | -- | Install via npm |

**Missing dependencies with no fallback:**
- None -- all runtime dependencies available.

**Missing dependencies with fallback:**
- TypeScript, vitest, tsup -- development dependencies to be installed during project setup (Wave 0).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.x (to be installed) |
| Config file | `vitest.config.ts` -- see Wave 0 |
| Quick run command | `npx vitest run tests/transport.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRAN-01 | Send JSON-RPC request, receive JSON-RPC response over stdio | unit | `npx vitest run tests/transport.test.ts -t "send and receive"` | No -- Wave 0 |
| TRAN-01 | Handle notifications (method, no id) | unit | `npx vitest run tests/transport.test.ts -t "notification"` | No -- Wave 0 |
| TRAN-01 | Handle server-initiated requests (method + id) | unit | `npx vitest run tests/transport.test.ts -t "server request"` | No -- Wave 0 |
| TRAN-02 | Process spawned once, reused across multiple requests | unit | `npx vitest run tests/transport.test.ts -t "reuse"` | No -- Wave 0 |
| TRAN-02 | Auto-restart on crash (D-03) | unit | `npx vitest run tests/transport.test.ts -t "restart"` | No -- Wave 0 |
| TRAN-02 | Graceful shutdown SIGTERM + SIGKILL (D-04) | unit | `npx vitest run tests/transport.test.ts -t "shutdown"` | No -- Wave 0 |
| TRAN-03 | Request/response correlation by ID | unit | `npx vitest run tests/transport.test.ts -t "correlat"` | No -- Wave 0 |
| TRAN-03 | Concurrent requests with different IDs resolve correctly | unit | `npx vitest run tests/transport.test.ts -t "concurrent"` | No -- Wave 0 |
| TRAN-03 | Timeout for requests that never receive response | unit | `npx vitest run tests/transport.test.ts -t "timeout"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/transport.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` -- framework configuration
- [ ] `tsconfig.json` -- TypeScript configuration
- [ ] `package.json` -- project manifest with dependencies
- [ ] `tests/transport.test.ts` -- covers TRAN-01, TRAN-02, TRAN-03
- [ ] Framework install: `npm install -D vitest typescript tsup @types/node`

## Sources

### Primary (HIGH confidence)
- `context/cursor_acp.md` -- Official ACP protocol documentation with minimal Node.js client example. Defines transport format, message flow, all method signatures.
- `context/cursor-agent-acp-npm/src/utils/json-rpc.ts` -- JSON-RPC 2.0 utility reference. Error codes, request ID handling, response creation.
- `context/cursor-agent-acp-npm/src/cursor/cli-bridge.ts` -- Process spawning patterns, timeout handling, retry logic.
- `context/cursor-agent-acp-npm/src/protocol/initialization.ts` -- ACP initialization handler with version negotiation, capability building, type imports from SDK.
- `.planning/research/ARCHITECTURE.md` -- Architecture patterns, component boundaries, data flow diagrams.

### Secondary (MEDIUM confidence)
- [ACP Protocol Overview](https://agentclientprotocol.com/protocol/overview) -- Protocol architecture, message types, session lifecycle.
- [ACP Protocol Schema](https://agentclientprotocol.com/protocol/schema) -- SessionUpdate types, permission request/response format.
- [ACP Session Setup](https://agentclientprotocol.com/protocol/session-setup) -- session/new, session/load request/response format.
- [ACP Prompt Turn](https://agentclientprotocol.com/protocol/prompt-turn) -- session/prompt, session/update, session/cancel, stopReason values.
- [ACP Initialization](https://agentclientprotocol.com/protocol/initialization) -- initialize request/response, version negotiation rules.
- [ACP TypeScript SDK](https://github.com/agentclientprotocol/typescript-sdk) -- SDK v0.17.x, ClientSideConnection, AgentSideConnection.
- [@agentclientprotocol/sdk on npm](https://www.npmjs.com/package/@agentclientprotocol/sdk) -- Package version 0.17.x, Apache-2.0 license.

### Tertiary (LOW confidence)
- ACP SDK exact type exports: Based on reference adapter import statements (may have changed in 0.17.x from 0.5.x). Validate during `npm install`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Node.js built-ins + official ACP SDK; well-documented
- Architecture: HIGH -- Minimal Node.js client provided in official docs; reference adapter confirms patterns
- Pitfalls: HIGH -- Derived from JSON-RPC spec + real implementation experience in reference adapter

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (ACP SDK is fast-moving; check for breaking changes if delayed)
