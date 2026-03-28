// Mock ACP subprocess for integration tests.
// Responds to JSON-RPC over stdio (newline-delimited JSON).
// Usage: node mock-acp-server.mjs --scenario=<name>
// Scenarios: happy-path (default), auth-error, session-error, cli-not-found (unused here)
import { createInterface } from 'node:readline';

const scenario = process.argv.find(a => a.startsWith('--scenario='))?.split('=')[1] ?? 'happy-path';

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function makeResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function makeError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }

  const { id, method } = msg;

  if (method === 'initialize') {
    send(makeResult(id, { protocolVersion: 1, serverInfo: { name: 'mock-acp', version: '0.0.1' } }));
    return;
  }

  if (method === 'authenticate') {
    if (scenario === 'auth-error') {
      send(makeError(id, -32000, 'Authentication failed'));
    } else {
      send(makeResult(id, {}));
    }
    return;
  }

  if (method === 'session/new') {
    send(makeResult(id, { sessionId: 'mock-session-1' }));
    return;
  }

  if (method === 'session/prompt') {
    if (scenario === 'session-error') {
      send(makeError(id, -32001, 'Session error'));
      return;
    }
    // happy-path: send text notification then done notification then result
    const sessionId = msg.params?.sessionId ?? 'mock-session-1';
    // Send agent_message_chunk notification with ACP ContentChunk shape
    send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Hello from mock' },
        },
      },
    });
    send(makeResult(id, { stopReason: 'end_turn' }));
    return;
  }
});

rl.on('close', () => process.exit(0));
process.stdin.on('close', () => process.exit(0));
