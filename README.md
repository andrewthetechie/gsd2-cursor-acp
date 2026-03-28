# @gsd/pi-ai-cursor-acp

Cursor ACP provider for GSD-2 — integrates Cursor as a first-class LLM provider via the Agent Client Protocol (ACP) over stdio.

## Prerequisites

- [Cursor](https://cursor.com) installed with `cursor-agent` on your PATH
- Run `cursor-agent login` (or set `CURSOR_API_KEY`) to authenticate
- Node.js 22.0.0 or later

## Installation

```bash
npm install @gsd/pi-ai-cursor-acp
```

Or, if using a workspace:

```bash
npm install @gsd/pi-ai-cursor-acp --workspace=<your-package>
```

## Configuration

| Option / Env Var | Default | Description |
|---|---|---|
| `CURSOR_API_KEY` | (none) | API key passed to `cursor-agent --api-key` on every connection |
| `options.binaryPath` | `cursor-agent` | Custom path to the `cursor-agent` binary |

## Usage

```typescript
import { registerCursorAcpProvider } from '@gsd/pi-ai-cursor-acp';

// Register at startup — throws CursorCliNotFoundError if cursor-agent not on PATH
await registerCursorAcpProvider();

// Use via GSD-2 provider API
const provider = getApiProvider('cursor-acp');
const stream = provider.stream(context, model);
for await (const event of stream) {
  if (event.type === 'text_delta') process.stdout.write(event.delta);
  if (event.type === 'done') break;
}
```

## Error Handling

| Error class | When thrown | How to resolve |
|---|---|---|
| `CursorCliNotFoundError` | `cursor-agent` binary not found on PATH | Install Cursor from [cursor.com](https://cursor.com) and ensure `cursor-agent` is on your PATH |
| `CursorAuthError` | Authentication expired or missing | Run `cursor-agent login` or set `CURSOR_API_KEY` environment variable |
| `CursorSessionError` | `session/new` or `session/prompt` request failed | Check that Cursor is running and the requested model is available on your subscription |

```typescript
import {
  CursorCliNotFoundError,
  CursorAuthError,
  CursorSessionError,
  registerCursorAcpProvider,
} from '@gsd/pi-ai-cursor-acp';

try {
  await registerCursorAcpProvider();
} catch (err) {
  if (err instanceof CursorCliNotFoundError) {
    console.error('Install Cursor: https://cursor.com');
  } else if (err instanceof CursorAuthError) {
    console.error('Run: cursor-agent login');
  } else {
    throw err;
  }
}
```

## Permission Policy

The provider responds automatically to `session/request_permission` requests from the ACP server. Configure the policy when constructing `AcpSessionPool`:

| Policy | Behaviour |
|---|---|
| `auto-approve-all` (default) | Approves every permission request without prompting |
| `approve-reads-reject-writes` | Approves read-only tools; rejects write tools |
| `interactive` | Emits `permission_request` events for the caller to handle |

## Advanced: Custom Binary Path

If `cursor-agent` is not on your PATH, provide the full path explicitly:

```typescript
await registerCursorAcpProvider({ binaryPath: '/usr/local/bin/cursor-agent' });
```

The same `binaryPath` value is used for both the binary check and the ACP transport subprocess.
>>>>>>> 9d05ce6 (feat(05-02): write README.md, TESTING.md, and add TSDoc to public exports)
