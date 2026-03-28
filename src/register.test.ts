import { describe, it, expect, beforeEach } from "vitest";
import { getApiProvider, clearApiProviders } from "./api-registry.js";
import { registerCursorAcpProvider } from "./register.js";

describe("registerCursorAcpProvider", () => {
  beforeEach(() => {
    clearApiProviders();
  });

  it("registers cursor-acp in the GSD-2 provider registry", () => {
    registerCursorAcpProvider();
    const provider = getApiProvider("cursor-acp");
    expect(provider).toBeDefined();
    expect(provider!.api).toBe("cursor-acp");
  });

  it("provider has stream and streamSimple functions", () => {
    registerCursorAcpProvider();
    const provider = getApiProvider("cursor-acp");
    expect(typeof provider!.stream).toBe("function");
    expect(typeof provider!.streamSimple).toBe("function");
  });
});
