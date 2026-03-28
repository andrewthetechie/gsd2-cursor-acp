/**
 * Local registry module mirroring @gsd/pi-ai's api-registry interface.
 *
 * This module exists because @gsd/pi-ai is a peer dependency not installed
 * in this project's node_modules. When @gsd/pi-ai is available, this file
 * should be removed and imports updated to use '@gsd/pi-ai' directly.
 *
 * Types and logic match context/gsd-2/packages/pi-ai/src/api-registry.ts exactly.
 */

import type { AssistantMessageEventStream } from "./provider.js";

// Minimal type aliases matching @gsd/pi-ai shapes
export type Api = string;

export type ApiStreamFunction = (
  model: { api: Api; [key: string]: unknown },
  context: { messages: unknown[]; systemPrompt?: string; tools?: unknown[] },
  options?: { signal?: AbortSignal; [key: string]: unknown },
) => AssistantMessageEventStream;

export interface ApiProvider<TApi extends Api = Api> {
  api: TApi;
  stream: ApiStreamFunction;
  streamSimple: ApiStreamFunction;
}

interface ApiProviderInternal {
  api: Api;
  stream: ApiStreamFunction;
  streamSimple: ApiStreamFunction;
}

type RegisteredApiProvider = {
  provider: ApiProviderInternal;
  sourceId?: string;
};

const apiProviderRegistry = new Map<string, RegisteredApiProvider>();

export function registerApiProvider<TApi extends Api>(
  provider: ApiProvider<TApi>,
  sourceId?: string,
): void {
  apiProviderRegistry.set(provider.api, {
    provider: {
      api: provider.api,
      stream: provider.stream,
      streamSimple: provider.streamSimple,
    },
    sourceId,
  });
}

export function getApiProvider(api: Api): ApiProviderInternal | undefined {
  return apiProviderRegistry.get(api)?.provider;
}

export function clearApiProviders(): void {
  apiProviderRegistry.clear();
}
