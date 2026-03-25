import { describe, expect, test } from "vitest";

import {
  isSupportedMcpTarget,
  renderMcpConfig,
  stringifyMcpConfig,
  supportedMcpTargets,
} from "../src/core/mcp-config.js";

describe("isSupportedMcpTarget", () => {
  test("returns true for supported targets", () => {
    expect(isSupportedMcpTarget("claude-code")).toBe(true);
    expect(isSupportedMcpTarget("copilot")).toBe(true);
  });

  test("returns false for unsupported targets", () => {
    expect(isSupportedMcpTarget("vscode")).toBe(false);
    expect(isSupportedMcpTarget("")).toBe(false);
    expect(isSupportedMcpTarget("CLAUDE-CODE")).toBe(false);
  });

  test("all supportedMcpTargets pass isSupportedMcpTarget", () => {
    for (const target of supportedMcpTargets) {
      expect(isSupportedMcpTarget(target)).toBe(true);
    }
  });
});

describe("renderMcpConfig", () => {
  test("renders claude-code config without type field", () => {
    const config = renderMcpConfig("claude-code", "/my/project");

    expect(config).toEqual({
      mcpServers: {
        "context-hub": {
          command: "npx",
          args: ["-y", "context-hub-mcp@latest", "serve", "--cwd", "/my/project"],
        },
      },
    });
  });

  test("renders copilot config with type: local", () => {
    const config = renderMcpConfig("copilot", "/my/project");

    expect(config).toEqual({
      mcpServers: {
        "context-hub": {
          type: "local",
          command: "npx",
          args: ["-y", "context-hub-mcp@latest", "serve", "--cwd", "/my/project"],
        },
      },
    });
  });

  test("uses custom server name when provided", () => {
    const config = renderMcpConfig("claude-code", "/my/project", "my-docs");

    expect(config.mcpServers["my-docs"]).toBeDefined();
    expect(config.mcpServers["context-hub"]).toBeUndefined();
  });
});

describe("stringifyMcpConfig", () => {
  test("produces valid indented JSON with trailing newline", () => {
    const config = renderMcpConfig("claude-code", "/my/project");
    const output = stringifyMcpConfig(config);

    expect(() => JSON.parse(output)).not.toThrow();
    expect(output.endsWith("\n")).toBe(true);
    expect(output).toContain("  ");
  });
});
