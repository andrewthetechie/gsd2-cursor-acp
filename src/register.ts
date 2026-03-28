import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { registerApiProvider } from './api-registry.js';
import { cursorAcpProvider } from './provider.js';
import { buildModel, type CursorAcpModel } from './model-metadata.js';
import { DEFAULT_TRANSPORT_OPTIONS } from './types.js';
import { CursorCliNotFoundError } from './errors.js';

const execFileAsync = promisify(execFile);

// Module-level storage for discovered models.
// Empty until registerCursorAcpProvider() resolves.
let _registeredModels: CursorAcpModel[] = [];

/**
 * Returns the list of Cursor ACP models registered by the most recent
 * registerCursorAcpProvider() call. Returns [] before registration.
 */
export function getCursorAcpModels(): CursorAcpModel[] {
  return _registeredModels;
}

/**
 * Parse model IDs from cursor-agent --list-models plain-text output.
 * Ink renders one model per line as: "<modelId> [- <displayName>] [(current)] [(default)]"
 * when stdout is non-TTY with NO_COLOR=1.
 *
 * Lines skipped: empty lines, "Available models" header, "Tip:" footer,
 * "No models available" message.
 *
 * The first whitespace-delimited token on each remaining line is the model ID.
 */
export function parseModelIds(stdout: string): string[] {
  const ids: string[] = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('Available models')) continue;
    if (trimmed.startsWith('Tip:')) continue;
    if (trimmed.startsWith('No models available')) continue;
    const id = trimmed.split(/\s/)[0];
    if (id) ids.push(id);
  }
  return ids;
}

/**
 * Spawn cursor-agent --list-models and return the list of native model IDs.
 * D-01: uses the cursor-agent binary (same binaryPath as ACP transport).
 * D-02: throws on any failure — discovery failure is hard-fatal.
 *
 * @throws Error with message containing 'model discovery failed' on spawn error
 * @throws Error with message containing 'produced no model IDs' if list is empty
 */
export async function discoverModelIds(binaryPath: string): Promise<string[]> {
  let stdout: string;
  try {
    const result = await execFileAsync(binaryPath, ['--list-models'], {
      timeout: 15_000,
      env: {
        ...process.env,
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
    });
    stdout = result.stdout;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`cursor-agent model discovery failed: ${msg}`);
  }

  const ids = parseModelIds(stdout);
  if (ids.length === 0) {
    throw new Error(
      `cursor-agent --list-models produced no model IDs. stdout: ${stdout.slice(0, 200)}`,
    );
  }
  return ids;
}

/**
 * Register the Cursor ACP provider with GSD-2's provider registry.
 *
 * BREAKING CHANGE from Phase 3: This function is now async.
 * Callers MUST await this before using cursor-acp models.
 *
 * D-09: async, returns Promise<void>.
 * D-10: discovery runs eagerly — models are registered before the promise resolves.
 * D-11: no disk caching — discovery runs fresh on every call.
 *
 * @example
 * import { registerCursorAcpProvider } from '@gsd/pi-ai-cursor-acp';
 * await registerCursorAcpProvider();
 */
export async function registerCursorAcpProvider(options?: {
  binaryPath?: string;
}): Promise<void> {
  const binaryPath = options?.binaryPath ?? DEFAULT_TRANSPORT_OPTIONS.binaryPath;
  try {
    await execFileAsync(binaryPath, ['--version'], { timeout: 5_000 });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new CursorCliNotFoundError();
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`cursor-agent binary check failed: ${msg}`);
  }
  const nativeIds = await discoverModelIds(binaryPath);
  _registeredModels = nativeIds.map(buildModel);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerApiProvider(cursorAcpProvider as any);
}
