import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AcpSessionPool } from './session-pool.js';
import { streamCursorAcp, _setPoolForTest } from './provider.js';
import {
  CursorCliNotFoundError,
  CursorAuthError,
  CursorSessionError,
} from './errors.js';
import { registerCursorAcpProvider } from './register.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, '__fixtures__', 'mock-acp-server.mjs');

function makePool(scenario: string) {
  return new AcpSessionPool({
    transportOptions: {
      binaryPath: 'node',
      binaryArgs: [FIXTURE, `--scenario=${scenario}`],
    },
  });
}

describe('integration: full stack with mock ACP subprocess', () => {
  let pool: AcpSessionPool | undefined;

  afterEach(async () => {
    if (pool) {
      try {
        await pool.shutdown();
      } catch {
        // Ignore shutdown errors
      }
      pool = undefined;
    }
    // Reset module-level pool after each test
    _setPoolForTest(null);
  });

  it('happy path: stream() emits text_delta and done events', async () => {
    pool = makePool('happy-path');
    _setPoolForTest(pool);
    const model = { id: 'claude-sonnet-4-5', provider: 'cursor-acp', api: 'cursor-acp', name: 'Claude Sonnet', baseUrl: '', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200000, maxTokens: 8192 } as any;
    const context = { cwd: '/tmp', messages: [{ role: 'user', content: 'hi', timestamp: Date.now() }] } as any;
    const stream = streamCursorAcp(model, context, {});
    const events: any[] = [];
    for await (const ev of stream) events.push(ev);
    const types = events.map(e => e.type);
    expect(types).toContain('text_delta');
    expect(types).toContain('done');
  }, 15_000);

  it('auth failure path: getOrCreateSession throws CursorAuthError', async () => {
    pool = makePool('auth-error');
    await expect(pool.getOrCreateSession('/tmp')).rejects.toBeInstanceOf(CursorAuthError);
  }, 15_000);

  it('session/prompt error path: stream() emits error event with CursorSessionError in message', async () => {
    pool = makePool('session-error');
    _setPoolForTest(pool);
    const model = { id: 'claude-sonnet-4-5', provider: 'cursor-acp', api: 'cursor-acp', name: 'Claude Sonnet', baseUrl: '', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200000, maxTokens: 8192 } as any;
    const context = { cwd: '/tmp', messages: [{ role: 'user', content: 'hi', timestamp: Date.now() }] } as any;
    const stream = streamCursorAcp(model, context, {});
    const events: any[] = [];
    for await (const ev of stream) events.push(ev);
    const errEvent = events.find(e => e.type === 'error');
    expect(errEvent).toBeDefined();
    expect(errEvent.error.errorMessage).toContain('CursorSessionError');
  }, 15_000);

  it('CLI not found path: registerCursorAcpProvider throws CursorCliNotFoundError for non-existent binary', async () => {
    await expect(
      registerCursorAcpProvider({ binaryPath: '/nonexistent/cursor-agent-missing' })
    ).rejects.toBeInstanceOf(CursorCliNotFoundError);
  }, 10_000);
});
