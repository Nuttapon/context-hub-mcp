import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { createTempWorkspace, disposeWorkspace } from "./helpers.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(disposeWorkspace));
});

async function runCli(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  const { spawn } = await import("node:child_process");

  return new Promise((resolve, reject) => {
    const child = spawn("node", ["--import", "tsx", "./src/cli/index.ts", ...args], {
      cwd: path.resolve(import.meta.dirname, ".."),
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", exitCode => {
      resolve({ stdout, stderr, exitCode });
    });
  });
}

describe("CLI", () => {
  test("init scaffolds a ready-to-use workspace", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    const result = await runCli(["init", "--cwd", workspace], workspace);

    expect(result.exitCode).toBe(0);

    await access(path.join(workspace, ".context", ".gitignore"));
    await access(path.join(workspace, ".context", "schema.md"));
    await access(path.join(workspace, ".context", "domains", "example-domain.md"));
    await access(path.join(workspace, ".context", "integrations", "example-integration.md"));
    await access(path.join(workspace, ".context", "pitfalls", "example-pitfall.md"));
    await access(path.join(workspace, "context-hub.config.json"));

    const gitignore = await readFile(path.join(workspace, ".context", ".gitignore"), "utf8");
    expect(gitignore).toContain("context_hub.db");
    expect(result.stdout).toMatch(/next steps/i);
  });

  test("init non-interactive output keeps the scaffold next steps", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    const result = await runCli(["init", "--cwd", workspace], workspace);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Initialized Context Hub workspace.");
    expect(result.stdout).toContain("Run `npx context-hub-mcp reindex`");
    expect(result.stdout).toContain("Point your MCP client at `npx context-hub-mcp serve`.");
  });

  test("doctor and reindex report workspace health", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    await runCli(["init", "--cwd", workspace], workspace);

    const reindex = await runCli(["reindex", "--cwd", workspace], workspace);
    expect(reindex.exitCode).toBe(0);
    expect(reindex.stdout).toMatch(/indexed/i);

    const doctor = await runCli(["doctor", "--cwd", workspace], workspace);
    expect(doctor.exitCode).toBe(0);
    expect(doctor.stdout).toMatch(/context directory/i);
    expect(doctor.stdout).toMatch(/sqlite/i);
    expect(doctor.stdout).toMatch(/documents indexed/i);
  });

  test("doctor reports missing .context without creating local SQLite files", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    const doctor = await runCli(["doctor", "--cwd", workspace], workspace);

    expect(doctor.exitCode).toBe(0);
    expect(doctor.stdout).toMatch(/context directory: missing/i);
    expect(doctor.stdout).toMatch(/documents indexed: 0/i);
    await expect(access(path.join(workspace, ".context", "context_hub.db"))).rejects.toThrow();
  });

  test("config prints Claude Code MCP config JSON to stdout", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    const result = await runCli(["config", "--target", "claude-code", "--cwd", workspace], workspace);

    expect(result.exitCode).toBe(0);

    const config = JSON.parse(result.stdout);
    expect(config).toEqual({
      mcpServers: {
        "context-hub": {
          command: "npx",
          args: ["-y", "context-hub-mcp@latest", "serve", "--cwd", workspace],
        },
      },
    });
  });

  test("config prints Copilot MCP config JSON to stdout", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    const result = await runCli(["config", "--target", "copilot", "--cwd", workspace], workspace);

    expect(result.exitCode).toBe(0);

    const config = JSON.parse(result.stdout);
    expect(config).toEqual({
      mcpServers: {
        "context-hub": {
          type: "local",
          command: "npx",
          args: ["-y", "context-hub-mcp@latest", "serve", "--cwd", workspace],
        },
      },
    });
  });

  test("config writes generated JSON to a file when --out is provided", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);
    const outputPath = path.join(workspace, "context-hub.mcp.json");

    const result = await runCli(
      ["config", "--target", "claude-code", "--cwd", workspace, "--out", outputPath],
      workspace,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/wrote mcp config/i);

    const fileContents = await readFile(outputPath, "utf8");
    expect(JSON.parse(fileContents)).toEqual({
      mcpServers: {
        "context-hub": {
          command: "npx",
          args: ["-y", "context-hub-mcp@latest", "serve", "--cwd", workspace],
        },
      },
    });
  });

  test("config rejects unsupported targets with a helpful error", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    const result = await runCli(["config", "--target", "unknown", "--cwd", workspace], workspace);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/unsupported target/i);
    expect(result.stderr).toMatch(/claude-code/i);
    expect(result.stderr).toMatch(/copilot/i);
  });

  test("config allows overriding the MCP server name", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    const result = await runCli(
      ["config", "--target", "claude-code", "--cwd", workspace, "--name", "docs-hub"],
      workspace,
    );

    expect(result.exitCode).toBe(0);

    const config = JSON.parse(result.stdout);
    expect(config).toEqual({
      mcpServers: {
        "docs-hub": {
          command: "npx",
          args: ["-y", "context-hub-mcp@latest", "serve", "--cwd", workspace],
        },
      },
    });
  });

  test("config can list supported targets without other required flags", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    const result = await runCli(["config", "--list-targets"], workspace);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("claude-code");
    expect(result.stdout).toContain("copilot");
  });
});
