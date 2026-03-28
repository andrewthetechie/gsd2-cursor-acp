# Testing

## Running the Test Suite

Run all tests:

```bash
npm test
```

Run integration tests only (with verbose output):

```bash
npm test -- --reporter=verbose src/integration.test.ts
```

Run a single test file:

```bash
npm test -- src/transport.test.ts
```

## Test Files

| File | What it covers |
|------|----------------|
| `src/transport.test.ts` | AcpTransport: JSON-RPC message framing, correlation, timeout, crash recovery |
| `src/permission-handler.test.ts` | PermissionHandler: policy modes, tool kind routing |
| `src/session-pool.test.ts` | AcpSessionPool: lazy init, session reuse, CursorAuthError, retry |
| `src/event-translator.test.ts` | AcpEventTranslator: session/update -> GSD-2 event mapping |
| `src/provider.test.ts` | streamCursorAcp: happy path, cancellation, CursorSessionError mapping |
| `src/register.test.ts` | registerCursorAcpProvider: model discovery, CursorCliNotFoundError |
| `src/integration.test.ts` | Full stack integration: four scenarios via mock subprocess |

## Manual Smoke Test

Run these steps against a real Cursor installation to verify the full ACP integration:

1. Verify `cursor-agent` is on your PATH:

   ```bash
   cursor-agent --version
   ```

2. Authenticate with Cursor:

   ```bash
   cursor-agent login
   ```

3. Run the minimal usage example from README.md:

   ```typescript
   import { registerCursorAcpProvider } from '@gsd/pi-ai-cursor-acp';

   await registerCursorAcpProvider();

   const provider = getApiProvider('cursor-acp');
   const stream = provider.stream(context, model);
   for await (const event of stream) {
     if (event.type === 'text_delta') process.stdout.write(event.delta);
     if (event.type === 'done') break;
   }
   ```

4. Verify that a `text_delta` event is received with actual content from Cursor.

## Notes for Adding New Tests

- **Mocking `child_process`:** Use `vi.hoisted()` to define the mock spawn function before module imports. See `src/transport.test.ts` for the pattern.
- **Test isolation for `streamCursorAcp`:** Use `_setPoolForTest(pool)` (exported from `src/provider.ts`) to inject a custom `AcpSessionPool` instance, then call `_setPoolForTest(null)` in `afterEach` to reset the singleton.
- **Integration test fixture:** `src/__fixtures__/mock-acp-server.mjs` is a plain ESM script that responds to JSON-RPC over stdio. Add new scenarios by extending the `--scenario` argument handling.
