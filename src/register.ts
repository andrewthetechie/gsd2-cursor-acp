import { registerApiProvider } from "./api-registry.js";
import { cursorAcpProvider } from "./provider.js";

/**
 * Register the Cursor ACP provider with GSD-2's provider registry.
 * Call this once at application startup before using 'cursor-acp' models.
 *
 * @example
 * import { registerCursorAcpProvider } from '@gsd/pi-ai-cursor-acp';
 * registerCursorAcpProvider();
 */
export function registerCursorAcpProvider(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerApiProvider(cursorAcpProvider as any);
}
