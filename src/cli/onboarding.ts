import { confirm, select } from "@inquirer/prompts";

import { type McpTarget } from "../core/mcp-config.js";

type TargetChoice = {
  name: string;
  value: McpTarget;
  description: string;
};

export function buildTargetChoices(): TargetChoice[] {
  return [
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
  ];
}

export async function runInitOnboarding(_cwd: string): Promise<{ shouldRunReindex: boolean; target: McpTarget | null }> {
  const continueSetup = await confirm({
    message: "Continue setup now? This will build the index and generate MCP config.",
    default: true,
  });

  if (!continueSetup) {
    return { shouldRunReindex: false, target: null };
  }

  const target = await select<McpTarget>({
    message: "Choose an MCP client target",
    choices: buildTargetChoices(),
  });

  return { shouldRunReindex: true, target };
}
