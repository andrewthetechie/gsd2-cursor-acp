import type { PermissionOption, PermissionOptionKind } from "@agentclientprotocol/sdk";

export type PermissionPolicy = 'auto-approve-all' | 'approve-reads-reject-writes' | 'interactive';

export type RequestPermissionOutcome =
  | { outcome: 'cancelled' }
  | { outcome: 'selected'; optionId: string };

const READ_SAFE_KINDS = new Set<string>(['read', 'search', 'think', 'fetch']);
const WRITE_DANGEROUS_KINDS = new Set<string>(['edit', 'delete', 'move', 'execute']);

export class PermissionHandler {
  constructor(private readonly policy: PermissionPolicy) {}

  resolvePermission(
    toolKind: string | undefined,
    options: PermissionOption[],
  ): RequestPermissionOutcome {
    switch (this.policy) {
      case 'auto-approve-all':
        return this.selectOption(options, 'allow_once');

      case 'approve-reads-reject-writes': {
        if (toolKind !== undefined && READ_SAFE_KINDS.has(toolKind)) {
          return this.selectOption(options, 'allow_once');
        }
        if (toolKind !== undefined && WRITE_DANGEROUS_KINDS.has(toolKind)) {
          return this.selectOption(options, 'reject_once');
        }
        // switch_mode, other, or undefined: fall back to first option
        return { outcome: 'selected', optionId: options[0].optionId };
      }

      case 'interactive':
        return { outcome: 'cancelled' };
    }
  }

  private selectOption(
    options: PermissionOption[],
    preferredKind: PermissionOptionKind,
  ): RequestPermissionOutcome {
    const option = options.find(o => o.kind === preferredKind);
    if (option) {
      return { outcome: 'selected', optionId: option.optionId };
    }
    // Fallback to first option
    return { outcome: 'selected', optionId: options[0].optionId };
  }
}
