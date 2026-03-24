export const supportedMcpTargets = ["claude-code", "copilot"] as const;

export type McpTarget = (typeof supportedMcpTargets)[number];

type McpServerConfig = {
  command: string;
  args: string[];
  type?: "local";
};

type McpClientConfig = {
  mcpServers: {
    [serverName: string]: McpServerConfig;
  };
};

export function isSupportedMcpTarget(value: string): value is McpTarget {
  return supportedMcpTargets.includes(value as McpTarget);
}

export function renderMcpConfig(target: McpTarget, cwd: string, serverName = "context-hub"): McpClientConfig {
  const sharedServerConfig = {
    command: "npx",
    args: ["-y", "context-hub-mcp@latest", "serve", "--cwd", cwd],
  };

  if (target === "copilot") {
    return {
      mcpServers: {
        [serverName]: {
          ...sharedServerConfig,
          type: "local",
        },
      },
    };
  }

  return {
    mcpServers: {
      [serverName]: sharedServerConfig,
    },
  };
}

export function stringifyMcpConfig(config: McpClientConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}
