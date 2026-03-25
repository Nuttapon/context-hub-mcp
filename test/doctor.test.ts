import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { loadConfig } from "../src/core/config.js";
import { runDoctor } from "../src/core/doctor.js";
import { createTempWorkspace, disposeWorkspace, sampleFrontmatter, writeContextFile } from "./helpers.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(disposeWorkspace));
});

describe("runDoctor", () => {
  test("reports missing .context directory", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    const config = await loadConfig({ cwd: workspace });
    const report = await runDoctor(config);

    expect(report).toMatch(/context directory: missing/i);
    expect(report).toMatch(/documents indexed: 0/i);
  });

  test("reports missing .gitignore", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    await mkdir(path.join(workspace, ".context"), { recursive: true });

    const config = await loadConfig({ cwd: workspace });
    const report = await runDoctor(config);

    expect(report).toMatch(/context directory:/i);
    expect(report).toMatch(/context .gitignore: missing/i);
  });

  test("reports healthy workspace with documents", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    await writeContextFile(
      workspace,
      "schema.md",
      `${sampleFrontmatter({ title: "Schema", domain: "meta" })}
# Schema
`,
    );

    const gitignorePath = path.join(workspace, ".context", ".gitignore");
    await writeFile(
      gitignorePath,
      "context_hub.db\ncontext_hub.db-shm\ncontext_hub.db-wal\n",
      "utf8",
    );

    const config = await loadConfig({ cwd: workspace });
    const report = await runDoctor(config);

    expect(report).toMatch(/documents indexed: 1/i);
    expect(report).toMatch(/sqlite ignore rules: ok/i);
    expect(report).toMatch(/context .gitignore: present/i);
    expect(report).toMatch(/parse errors: 0/i);
  });

  test("reports parse errors for malformed documents", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    await writeContextFile(workspace, "broken.md", "# No frontmatter here");

    const config = await loadConfig({ cwd: workspace });
    const report = await runDoctor(config);

    expect(report).toMatch(/parse errors: 1/i);
    expect(report).toMatch(/broken\.md/);
  });

  test("does not create SQLite file when .context is missing", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    const config = await loadConfig({ cwd: workspace });
    await runDoctor(config);

    const { access } = await import("node:fs/promises");
    await expect(access(config.dbPath)).rejects.toThrow();
  });
});
