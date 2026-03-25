import { afterEach, describe, expect, test } from "vitest";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadConfig } from "../src/core/config.js";
import { openContextStore } from "../src/core/store.js";
import { registerTools } from "../src/tools/index.js";
import { createTempWorkspace, disposeWorkspace, sampleFrontmatter, writeContextFile } from "./helpers.js";

import type { ContextStore } from "../src/core/store.js";

const workspaces: string[] = [];
const stores: ContextStore[] = [];

afterEach(async () => {
  await Promise.all(stores.splice(0).map(store => store.close()));
  await Promise.all(workspaces.splice(0).map(disposeWorkspace));
});

async function setupStore(workspace: string): Promise<ContextStore> {
  const config = await loadConfig({ cwd: workspace });
  const store = await openContextStore(config, { reindexOnOpen: false });
  stores.push(store);
  return store;
}

function getRegisteredHandler(
  server: McpServer,
  toolName: string,
): (args: Record<string, unknown>) => Promise<unknown> {
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: Record<string, unknown>) => Promise<unknown> }> })._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool "${toolName}" not registered`);
  return tool.handler;
}

describe("MCP tools error handling", () => {
  test("list_domains returns errorResult when store throws", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);
    const store = await setupStore(workspace);

    // Force the DB closed so operations will throw
    await store.close();
    stores.pop(); // already closed

    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerTools(server, store);

    const handler = getRegisteredHandler(server, "list_domains");
    const result = await handler({}) as { isError?: boolean; content: Array<{ text: string }> };

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBeTruthy();
  });

  test("get_pitfalls returns errorResult when store throws", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);
    const store = await setupStore(workspace);
    await store.close();
    stores.pop();

    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerTools(server, store);

    const handler = getRegisteredHandler(server, "get_pitfalls");
    const result = await handler({}) as { isError?: boolean; content: Array<{ text: string }> };

    expect(result.isError).toBe(true);
  });

  test("list_annotations returns errorResult when store throws", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);
    const store = await setupStore(workspace);
    await store.close();
    stores.pop();

    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerTools(server, store);

    const handler = getRegisteredHandler(server, "list_annotations");
    const result = await handler({}) as { isError?: boolean; content: Array<{ text: string }> };

    expect(result.isError).toBe(true);
  });

  test("reindex_context returns errorResult when store throws", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);
    const store = await setupStore(workspace);
    await store.close();
    stores.pop();

    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerTools(server, store);

    const handler = getRegisteredHandler(server, "reindex_context");
    const result = await handler({}) as { isError?: boolean; content: Array<{ text: string }> };

    expect(result.isError).toBe(true);
  });

  test("annotate_context rejects unknown document path", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);
    const store = await setupStore(workspace);
    await store.reindex();

    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerTools(server, store);

    const handler = getRegisteredHandler(server, "annotate_context");
    const result = await handler({ path: "nonexistent.md", note: "test" }) as { isError?: boolean };

    expect(result.isError).toBe(true);
  });

  test("rate_context rejects unknown document path", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);
    const store = await setupStore(workspace);
    await store.reindex();

    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerTools(server, store);

    const handler = getRegisteredHandler(server, "rate_context");
    const result = await handler({ path: "nonexistent.md", helpful: true }) as { isError?: boolean };

    expect(result.isError).toBe(true);
  });

  test("search_context returns results for known documents", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    await writeContextFile(
      workspace,
      "domains/payments.md",
      `${sampleFrontmatter({ title: "Payments" })}
# Payments

LINE Pay integration guide.
`,
    );

    const store = await setupStore(workspace);
    await store.reindex();

    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerTools(server, store);

    const handler = getRegisteredHandler(server, "search_context");
    const result = await handler({ query: "payments" }) as { isError?: boolean; content: Array<{ text: string }> };

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toMatch(/payments/i);
  });
});
