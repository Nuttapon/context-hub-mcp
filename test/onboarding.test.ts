import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { buildTargetChoices, writeGeneratedConfigFile } from "../src/cli/onboarding.js";
import { createTempWorkspace, disposeWorkspace } from "./helpers.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(disposeWorkspace));
});

describe("onboarding helpers", () => {
  test("buildTargetChoices returns prompt choices for each supported target", () => {
    expect(buildTargetChoices()).toEqual([
      {
        name: "Claude Code",
        value: "claude-code",
        description: "Generate ready-to-paste MCP config for Claude Code",
      },
      {
        name: "GitHub Copilot",
        value: "copilot",
        description: "Generate ready-to-paste MCP config for Copilot local MCP setup",
      },
    ]);
  });

  test("writeGeneratedConfigFile writes context-hub.mcp.json at the project root", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    const configContents = '{\n  "mcpServers": {}\n}\n';
    const outputPath = await writeGeneratedConfigFile(workspace, configContents);

    expect(outputPath).toBe(path.join(workspace, "context-hub.mcp.json"));
    await expect(readFile(outputPath, "utf8")).resolves.toBe(configContents);
  });
});
