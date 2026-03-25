import { describe, expect, test } from "vitest";

import { buildTargetChoices } from "../src/cli/onboarding.js";

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
});
