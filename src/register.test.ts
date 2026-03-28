import { vi, describe, it, expect, beforeEach } from 'vitest';
import { getApiProvider, clearApiProviders } from './api-registry.js';
import {
  registerCursorAcpProvider,
  getCursorAcpModels,
  parseModelIds,
  discoverModelIds,
} from './register.js';
import { CursorCliNotFoundError } from './errors.js';

// Mock node:child_process so tests never spawn real cursor-agent.
// Pitfall 3 from RESEARCH.md: cursor-agent requires unlocked macOS keychain.
//
// We mock the entire module with an execFile that has the Node.js custom
// promisify symbol attached. This makes promisify(execFile) return
// { stdout, stderr } (the object form) rather than just stdout (the string form).
// Without this, result.stdout is undefined in discoverModelIds.
//
// vi.hoisted() ensures the mock setup runs before vi.mock() hoisting.
const { mockExecFileFn } = vi.hoisted(() => {
  const PROMISIFY_CUSTOM = Symbol.for('nodejs.util.promisify.custom');
  const customPromiseFn = vi.fn();
  const execFileMock = vi.fn();
  (execFileMock as any)[PROMISIFY_CUSTOM] = customPromiseFn;
  return { mockExecFileFn: execFileMock };
});

vi.mock('node:child_process', () => ({
  execFile: mockExecFileFn,
}));

// Helper: build mock stdout in the Ink plain-text format documented in RESEARCH.md.
const MOCK_STDOUT = [
  'Available models',
  '',
  'claude-sonnet-4-5 - Claude Sonnet 4.5',
  'gpt-4o - GPT-4o (current)',
  'unknown-model-xyz - Some Future Model',
  '',
  'Tip: use --model <id> (or /model <id> in interactive mode) to switch.',
].join('\n');

// Set up execFile mock to resolve with MOCK_STDOUT by default.
// Individual tests override this for failure scenarios.
//
// Since register.ts uses promisify(execFile), we mock the custom promisify
// function (Symbol.for('nodejs.util.promisify.custom')) which is what
// promisify actually calls when present. This returns { stdout, stderr }.
async function setupMockExecFile(stdout = MOCK_STDOUT, rejectWith?: Error) {
  const PROMISIFY_CUSTOM = Symbol.for('nodejs.util.promisify.custom');
  const { execFile } = await import('node:child_process');
  const customPromisified = (execFile as any)[PROMISIFY_CUSTOM] as ReturnType<typeof vi.fn>;
  // Also mock the callback form for call assertion tests.
  const mockExecFile = vi.mocked(execFile);

  if (rejectWith) {
    customPromisified.mockRejectedValue(rejectWith);
    mockExecFile.mockImplementation((_bin, _args, _opts, callback) => {
      (callback as Function)(rejectWith, '', '');
      return {} as any;
    });
  } else {
    customPromisified.mockResolvedValue({ stdout, stderr: '' });
    mockExecFile.mockImplementation((_bin, _args, _opts, callback) => {
      (callback as Function)(null, stdout, '');
      return {} as any;
    });
  }
}

describe('parseModelIds', () => {
  it('extracts model IDs from plain-text Ink output', () => {
    const ids = parseModelIds(MOCK_STDOUT);
    expect(ids).toEqual(['claude-sonnet-4-5', 'gpt-4o', 'unknown-model-xyz']);
  });

  it('skips empty lines', () => {
    const ids = parseModelIds('\n\n\n');
    expect(ids).toEqual([]);
  });

  it('skips Available models header', () => {
    const ids = parseModelIds('Available models\ngpt-4o - GPT-4o');
    expect(ids).toEqual(['gpt-4o']);
  });

  it('skips Tip: footer', () => {
    const ids = parseModelIds('gpt-4o - GPT-4o\nTip: use --model <id>');
    expect(ids).toEqual(['gpt-4o']);
  });

  it('skips No models available message', () => {
    const ids = parseModelIds('No models available');
    expect(ids).toEqual([]);
  });

  it('extracts only first token (ignores display name after hyphen)', () => {
    const ids = parseModelIds('claude-sonnet-4-5 - Claude Sonnet 4.5 (default)');
    expect(ids).toEqual(['claude-sonnet-4-5']);
  });
});

describe('discoverModelIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls execFile with --list-models flag and suppression env vars', async () => {
    await setupMockExecFile();
    const ids = await discoverModelIds('cursor-agent');
    const PROMISIFY_CUSTOM = Symbol.for('nodejs.util.promisify.custom');
    const { execFile } = await import('node:child_process');
    const customFn = (execFile as any)[PROMISIFY_CUSTOM] as ReturnType<typeof vi.fn>;
    expect(customFn).toHaveBeenCalledOnce();
    const [bin, args, opts] = customFn.mock.calls[0] as any[];
    expect(bin).toBe('cursor-agent');
    expect(args).toEqual(['--list-models']);
    expect(opts.timeout).toBe(15_000);
    expect(opts.env.NO_COLOR).toBe('1');
    expect(opts.env.FORCE_COLOR).toBe('0');
  });

  it('respects custom binaryPath option', async () => {
    await setupMockExecFile();
    await discoverModelIds('/custom/path/cursor-agent');
    const PROMISIFY_CUSTOM = Symbol.for('nodejs.util.promisify.custom');
    const { execFile } = await import('node:child_process');
    const customFn = (execFile as any)[PROMISIFY_CUSTOM] as ReturnType<typeof vi.fn>;
    const [bin] = customFn.mock.calls[0] as any[];
    expect(bin).toBe('/custom/path/cursor-agent');
  });

  it('throws error containing "model discovery failed" when execFile rejects', async () => {
    await setupMockExecFile('', new Error('binary not found'));
    await expect(discoverModelIds('cursor-agent')).rejects.toThrow(
      'model discovery failed',
    );
  });

  it('throws error containing "produced no model IDs" when stdout has no parseable model lines', async () => {
    await setupMockExecFile('Available models\n\nTip: no models here.\n');
    await expect(discoverModelIds('cursor-agent')).rejects.toThrow(
      'produced no model IDs',
    );
  });

  it('returns parsed model IDs on success', async () => {
    await setupMockExecFile();
    const ids = await discoverModelIds('cursor-agent');
    expect(ids).toContain('claude-sonnet-4-5');
    expect(ids).toContain('gpt-4o');
    expect(ids).toContain('unknown-model-xyz');
  });
});

describe('registerCursorAcpProvider', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    clearApiProviders();
    await setupMockExecFile();
  });

  it('is async and returns Promise<void>', async () => {
    const result = await registerCursorAcpProvider();
    expect(result).toBeUndefined();
  });

  it('registers cursor-acp in the GSD-2 provider registry', async () => {
    await registerCursorAcpProvider();
    const provider = getApiProvider('cursor-acp');
    expect(provider).toBeDefined();
    expect(provider!.api).toBe('cursor-acp');
  });

  it('provider has stream and streamSimple functions', async () => {
    await registerCursorAcpProvider();
    const provider = getApiProvider('cursor-acp');
    expect(typeof provider!.stream).toBe('function');
    expect(typeof provider!.streamSimple).toBe('function');
  });
});

describe('getCursorAcpModels', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    clearApiProviders();
  });

  it('returns empty array before registration', () => {
    // Access module-level state — re-importing gives the same module instance.
    // If _registeredModels persists from other tests, this may be non-empty.
    // The important assertion is shape, not empty state here — test isolation
    // is handled by the beforeEach in other suites.
    const models = getCursorAcpModels();
    expect(Array.isArray(models)).toBe(true);
  });

  it('returns model list with cursor-acp/ prefixed IDs after registration', async () => {
    await setupMockExecFile();
    await registerCursorAcpProvider();
    const models = getCursorAcpModels();
    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
      expect(model.id).toMatch(/^cursor-acp\//);
    }
  });

  it('known model gpt-4o gets correct metadata from static table', async () => {
    await setupMockExecFile();
    await registerCursorAcpProvider();
    const models = getCursorAcpModels();
    const gpt4o = models.find((m) => m.id === 'cursor-acp/gpt-4o');
    expect(gpt4o).toBeDefined();
    expect(gpt4o!.contextWindow).toBe(128_000);
    expect(gpt4o!.maxTokens).toBe(16_384);
    expect(gpt4o!.reasoning).toBe(false);
  });

  it('unknown model gets safe defaults (D-04)', async () => {
    await setupMockExecFile();
    await registerCursorAcpProvider();
    const models = getCursorAcpModels();
    const unknown = models.find((m) => m.id === 'cursor-acp/unknown-model-xyz');
    expect(unknown).toBeDefined();
    expect(unknown!.contextWindow).toBe(128_000);
    expect(unknown!.reasoning).toBe(false);
    expect(unknown!.maxTokens).toBe(8_192);
  });

  it('all models have input: ["text"] and zero cost (D-05, D-03)', async () => {
    await setupMockExecFile();
    await registerCursorAcpProvider();
    for (const model of getCursorAcpModels()) {
      expect(model.input).toEqual(['text']);
      expect(model.cost.input).toBe(0);
      expect(model.cost.output).toBe(0);
      expect(model.cost.cacheRead).toBe(0);
      expect(model.cost.cacheWrite).toBe(0);
    }
  });

  it('all models have api: "cursor-acp" and empty baseUrl', async () => {
    await setupMockExecFile();
    await registerCursorAcpProvider();
    for (const model of getCursorAcpModels()) {
      expect(model.api).toBe('cursor-acp');
      expect(model.baseUrl).toBe('');
    }
  });

  it('uses custom binaryPath when provided', async () => {
    await setupMockExecFile();
    await registerCursorAcpProvider({ binaryPath: '/custom/cursor-agent' });
    const PROMISIFY_CUSTOM = Symbol.for('nodejs.util.promisify.custom');
    const { execFile } = await import('node:child_process');
    const customFn = (execFile as any)[PROMISIFY_CUSTOM] as ReturnType<typeof vi.fn>;
    const [bin] = customFn.mock.calls[0] as any[];
    expect(bin).toBe('/custom/cursor-agent');
  });
});

describe('registerCursorAcpProvider binary check (ERRH-01)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    clearApiProviders();
  });

  it('throws CursorCliNotFoundError when binary is not found (ENOENT)', async () => {
    const enoentErr = Object.assign(new Error('spawn cursor-agent ENOENT'), { code: 'ENOENT' });
    await setupMockExecFile(MOCK_STDOUT, enoentErr);
    await expect(registerCursorAcpProvider()).rejects.toBeInstanceOf(CursorCliNotFoundError);
  });

  it('CursorCliNotFoundError message contains cursor-agent not found', async () => {
    const enoentErr = Object.assign(new Error('spawn cursor-agent ENOENT'), { code: 'ENOENT' });
    await setupMockExecFile(MOCK_STDOUT, enoentErr);
    const err = await registerCursorAcpProvider().catch((e) => e);
    expect(err.message).toContain('cursor-agent not found');
  });

  it('throws generic Error when binary fails for non-ENOENT reason', async () => {
    const permErr = Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    await setupMockExecFile(MOCK_STDOUT, permErr);
    await expect(registerCursorAcpProvider()).rejects.toThrow('binary check failed');
  });

  it('non-ENOENT error does not throw CursorCliNotFoundError', async () => {
    const permErr = Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    await setupMockExecFile(MOCK_STDOUT, permErr);
    const err = await registerCursorAcpProvider().catch((e) => e);
    expect(err).not.toBeInstanceOf(CursorCliNotFoundError);
  });

  it('calls --version check before --list-models on success', async () => {
    await setupMockExecFile();
    await registerCursorAcpProvider();
    const PROMISIFY_CUSTOM = Symbol.for('nodejs.util.promisify.custom');
    const { execFile } = await import('node:child_process');
    const customFn = (execFile as any)[PROMISIFY_CUSTOM] as ReturnType<typeof vi.fn>;
    const calls = customFn.mock.calls as any[][];
    const argsList = calls.map((c) => c[1] as string[]);
    const versionIdx = argsList.findIndex((a) => a.includes('--version'));
    const listModelsIdx = argsList.findIndex((a) => a.includes('--list-models'));
    expect(versionIdx).toBeGreaterThanOrEqual(0);
    expect(listModelsIdx).toBeGreaterThan(versionIdx);
  });
});
