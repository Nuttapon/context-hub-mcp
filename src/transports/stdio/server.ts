import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { ContextWatcher } from "../../core/watcher.js";

import type { ContextHubConfig } from "../../core/types.js";

import { openContextStore } from "../../core/store.js";
import { registerTools } from "../../tools/index.js";

export async function startStdioServer(config: ContextHubConfig): Promise<{
  close: () => Promise<void>;
}> {
  const store = await openContextStore(config);
  const watcher = config.watch ? new ContextWatcher(config, store) : null;
  const server = new McpServer({
    name: "context-hub-mcp",
    version: "0.1.0",
  });

  registerTools(server, store);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  watcher?.start();

  const close = async (): Promise<void> => {
    await watcher?.close();
    await server.close();
    await store.close();
  };

  return { close };
}
