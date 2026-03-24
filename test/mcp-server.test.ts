import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { createTempWorkspace, disposeWorkspace, sampleFrontmatter, writeContextFile } from "./helpers.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(disposeWorkspace));
});

describe("MCP stdio server", () => {
  test("serves tools over stdio and can answer search/get requests", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    await writeContextFile(
      workspace,
      "domains/payments.md",
      `${sampleFrontmatter({ title: "Payments" })}
# Payments

## Key Files

- \`src/payments/service.ts\` - payment entrypoint

LINE Pay requires amount conversion.
`,
    );

    const transport = new StdioClientTransport({
      command: "node",
      args: ["--import", "tsx", "./src/cli/index.ts", "serve", "--cwd", workspace, "--no-watch"],
      cwd: path.resolve("/Users/nuttapon/Nutty/context-hub-mcp"),
    });

    const client = new Client(
      {
        name: "context-hub-mcp-test-client",
        version: "0.1.0",
      },
      {
        capabilities: {},
      },
    );

    await client.connect(transport);

    try {
      const tools = await client.listTools();
      expect(tools.tools.map(tool => tool.name)).toEqual(
        expect.arrayContaining([
          "list_domains",
          "search_context",
          "get_context",
          "get_context_structured",
          "get_pitfalls",
          "annotate_context",
          "rate_context",
          "list_annotations",
          "reindex_context",
        ]),
      );

      const search = (await client.callTool({
        name: "search_context",
        arguments: {
          query: "line-pay",
        },
      })) as { content: Array<{ type: string; text?: string }> };

      expect(search.content[0]?.type).toBe("text");
      expect((search.content[0] as { text?: string }).text).toMatch(/payments/i);

      const structured = (await client.callTool({
        name: "get_context_structured",
        arguments: {
          path: "domains/payments.md",
        },
      })) as unknown as {
        structuredContent: { path: string; keyFiles: Array<{ path: string }> };
      };

      expect(structured.structuredContent).toEqual(
        expect.objectContaining({
          path: "domains/payments.md",
          keyFiles: expect.arrayContaining([
            expect.objectContaining({ path: "src/payments/service.ts" }),
          ]),
        }),
      );
    } finally {
      await client.close();
      await transport.close();
    }
  });
});
