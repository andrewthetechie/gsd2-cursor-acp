/**
 * Static metadata lookup table for known Cursor model IDs.
 * Models not in this table receive DEFAULT_META (per D-04).
 *
 * Cost fields are all zero — Cursor uses subscription pricing (per D-03).
 * Input is always ['text'] — Cursor CLI does not support image attachments (per D-05).
 */

// Inline Model interface — matches src/provider.ts lines 188-199 exactly.
// Replace with `import type { Model } from '@gsd/pi-ai'` once peer dep is installed.
export interface CursorAcpModel {
  id: string;
  name: string;
  api: 'cursor-acp';
  provider: string;
  baseUrl: string;
  reasoning: boolean;
  input: ('text' | 'image')[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
}

export interface CursorModelMeta {
  contextWindow: number;
  reasoning: boolean;
  maxTokens: number;
}

export const DEFAULT_META: CursorModelMeta = {
  contextWindow: 128_000,
  reasoning: false,
  maxTokens: 8_192,
};

export const CURSOR_MODEL_METADATA: Record<string, CursorModelMeta> = {
  // Claude family
  'claude-sonnet-4-5':          { contextWindow: 200_000, reasoning: false, maxTokens: 8_192 },
  'claude-sonnet-4-5-thinking': { contextWindow: 200_000, reasoning: true,  maxTokens: 16_000 },
  'claude-opus-4':              { contextWindow: 200_000, reasoning: false, maxTokens: 32_000 },
  'claude-opus-4-5':            { contextWindow: 200_000, reasoning: false, maxTokens: 32_000 },
  'claude-3-5-sonnet':          { contextWindow: 200_000, reasoning: false, maxTokens: 8_192 },
  'claude-3-7-sonnet':          { contextWindow: 200_000, reasoning: false, maxTokens: 64_000 },
  'claude-3-7-sonnet-thinking': { contextWindow: 200_000, reasoning: true,  maxTokens: 64_000 },
  'claude-4-5-haiku':           { contextWindow: 200_000, reasoning: false, maxTokens: 8_192 },
  'claude-4-5-haiku-thinking':  { contextWindow: 200_000, reasoning: true,  maxTokens: 8_192 },
  // GPT family
  'gpt-4o':                     { contextWindow: 128_000, reasoning: false, maxTokens: 16_384 },
  'gpt-4o-mini':                { contextWindow: 128_000, reasoning: false, maxTokens: 16_384 },
  'gpt-5':                      { contextWindow: 128_000, reasoning: false, maxTokens: 32_000 },
  // Gemini family
  'gemini-2.5-pro':             { contextWindow: 1_000_000, reasoning: true,  maxTokens: 65_536 },
  'gemini-2.5-flash':           { contextWindow: 1_000_000, reasoning: true,  maxTokens: 65_536 },
  'gemini-2.0-flash':           { contextWindow: 1_048_576, reasoning: false, maxTokens: 8_192 },
};

/**
 * Build a CursorAcpModel object for a discovered native model ID (no prefix).
 * Applies D-06: prefix with cursor-acp/.
 * Applies D-03/D-04: static table lookup with safe defaults for unknowns.
 * Applies D-05: input is always ['text'].
 * Applies D-03: cost is always all zeros (subscription pricing).
 */
export function buildModel(nativeId: string): CursorAcpModel {
  const meta = CURSOR_MODEL_METADATA[nativeId] ?? DEFAULT_META;
  return {
    id: `cursor-acp/${nativeId}`,
    name: nativeId,
    api: 'cursor-acp' as const,
    provider: 'cursor-acp',
    baseUrl: '',
    reasoning: meta.reasoning,
    input: ['text'] as const,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: meta.contextWindow,
    maxTokens: meta.maxTokens,
  };
}
