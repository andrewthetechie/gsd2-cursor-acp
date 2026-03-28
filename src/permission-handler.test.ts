import { describe, it, expect } from "vitest";
import type { PermissionOption, PermissionOptionKind } from "@agentclientprotocol/sdk";
import { PermissionHandler } from "./permission-handler.js";

function makeOption(kind: string, optionId?: string): PermissionOption {
  return { optionId: optionId ?? `${kind}-id-123`, name: `${kind} option`, kind: kind as PermissionOptionKind };
}

const standardOptions: PermissionOption[] = [
  makeOption("allow_once", "allow-once-uuid-1"),
  makeOption("allow_always", "allow-always-uuid-2"),
  makeOption("reject_once", "reject-once-uuid-3"),
  makeOption("reject_always", "reject-always-uuid-4"),
];

describe("auto-approve-all", () => {
  const handler = new PermissionHandler("auto-approve-all");

  it("approves edit tool with allow_once option", () => {
    const result = handler.resolvePermission("edit", standardOptions);
    expect(result).toEqual({ outcome: "selected", optionId: "allow-once-uuid-1" });
  });

  it("approves read tool with allow_once option", () => {
    const result = handler.resolvePermission("read", standardOptions);
    expect(result).toEqual({ outcome: "selected", optionId: "allow-once-uuid-1" });
  });

  it("approves delete tool with allow_once option", () => {
    const result = handler.resolvePermission("delete", standardOptions);
    expect(result).toEqual({ outcome: "selected", optionId: "allow-once-uuid-1" });
  });
});

describe("approve-reads-reject-writes", () => {
  const handler = new PermissionHandler("approve-reads-reject-writes");

  it("approves read tool with allow_once option", () => {
    const result = handler.resolvePermission("read", standardOptions);
    expect(result).toEqual({ outcome: "selected", optionId: "allow-once-uuid-1" });
  });

  it("approves search tool with allow_once option", () => {
    const result = handler.resolvePermission("search", standardOptions);
    expect(result).toEqual({ outcome: "selected", optionId: "allow-once-uuid-1" });
  });

  it("approves think tool with allow_once option", () => {
    const result = handler.resolvePermission("think", standardOptions);
    expect(result).toEqual({ outcome: "selected", optionId: "allow-once-uuid-1" });
  });

  it("approves fetch tool with allow_once option", () => {
    const result = handler.resolvePermission("fetch", standardOptions);
    expect(result).toEqual({ outcome: "selected", optionId: "allow-once-uuid-1" });
  });

  it("rejects edit tool with reject_once option", () => {
    const result = handler.resolvePermission("edit", standardOptions);
    expect(result).toEqual({ outcome: "selected", optionId: "reject-once-uuid-3" });
  });

  it("rejects delete tool with reject_once option", () => {
    const result = handler.resolvePermission("delete", standardOptions);
    expect(result).toEqual({ outcome: "selected", optionId: "reject-once-uuid-3" });
  });

  it("rejects move tool with reject_once option", () => {
    const result = handler.resolvePermission("move", standardOptions);
    expect(result).toEqual({ outcome: "selected", optionId: "reject-once-uuid-3" });
  });

  it("rejects execute tool with reject_once option", () => {
    const result = handler.resolvePermission("execute", standardOptions);
    expect(result).toEqual({ outcome: "selected", optionId: "reject-once-uuid-3" });
  });

  it("falls back to first option for switch_mode tool", () => {
    const result = handler.resolvePermission("switch_mode", standardOptions);
    expect(result).toEqual({ outcome: "selected", optionId: "allow-once-uuid-1" });
  });

  it("falls back to first option for other tool", () => {
    const result = handler.resolvePermission("other", standardOptions);
    expect(result).toEqual({ outcome: "selected", optionId: "allow-once-uuid-1" });
  });
});

describe("interactive", () => {
  const handler = new PermissionHandler("interactive");

  it("returns cancelled outcome regardless of toolKind", () => {
    const result = handler.resolvePermission("edit", standardOptions);
    expect(result).toEqual({ outcome: "cancelled" });
  });

  it("returns cancelled for read tool as well", () => {
    const result = handler.resolvePermission("read", standardOptions);
    expect(result).toEqual({ outcome: "cancelled" });
  });
});

describe("edge cases", () => {
  it("falls back to first option when preferred kind not in options array", () => {
    const handler = new PermissionHandler("auto-approve-all");
    // Only allow_always options, no allow_once
    const options: PermissionOption[] = [
      makeOption("allow_always", "allow-always-only-1"),
      makeOption("reject_always", "reject-always-only-2"),
    ];
    const result = handler.resolvePermission("edit", options);
    // Falls back to first option since allow_once is not present
    expect(result).toEqual({ outcome: "selected", optionId: "allow-always-only-1" });
  });

  it("uses the only option when options array has one element", () => {
    const handler = new PermissionHandler("approve-reads-reject-writes");
    const options: PermissionOption[] = [
      makeOption("allow_once", "single-option-id"),
    ];
    const result = handler.resolvePermission("read", options);
    expect(result).toEqual({ outcome: "selected", optionId: "single-option-id" });
  });

  it("approve-reads-reject-writes falls back to first option when reject_once missing and tool is write", () => {
    const handler = new PermissionHandler("approve-reads-reject-writes");
    // No reject_once option available
    const options: PermissionOption[] = [
      makeOption("allow_once", "allow-once-fallback"),
      makeOption("allow_always", "allow-always-fallback"),
    ];
    // edit is a write-dangerous kind, but no reject_once, falls back to first option
    const result = handler.resolvePermission("edit", options);
    expect(result).toEqual({ outcome: "selected", optionId: "allow-once-fallback" });
  });
});
