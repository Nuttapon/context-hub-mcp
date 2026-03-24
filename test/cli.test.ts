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
      cwd: path.resolve("/Users/nuttapon/Nutty/context-hub-mcp"),
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
});
