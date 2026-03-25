import { writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { loadConfig } from "../src/core/config.js";
import { createTempWorkspace, disposeWorkspace } from "./helpers.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(disposeWorkspace));
});

describe("loadConfig", () => {
  test("returns defaults when no config file exists", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    const config = await loadConfig({ cwd: workspace });

    expect(config.cwd).toBe(workspace);
    expect(config.configPath).toBeNull();
    expect(config.contextDir).toBe(path.join(workspace, ".context"));
    expect(config.dbPath).toBe(path.join(workspace, ".context", "context_hub.db"));
    expect(config.watch).toBe(true);
    expect(config.reindexDebounceMs).toBe(250);
    expect(config.includeGlobs).toEqual(["**/*.md"]);
    expect(config.excludeGlobs).toEqual(["**/.git/**"]);
  });

  test("loads and merges values from a config file", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    await writeFile(
      path.join(workspace, "context-hub.config.json"),
      JSON.stringify({
        reindexDebounceMs: 500,
        watch: false,
        includeGlobs: ["docs/**/*.md"],
      }),
      "utf8",
    );

    const config = await loadConfig({ cwd: workspace });

    expect(config.configPath).toBe(path.join(workspace, "context-hub.config.json"));
    expect(config.reindexDebounceMs).toBe(500);
    expect(config.watch).toBe(false);
    expect(config.includeGlobs).toEqual(["docs/**/*.md"]);
    expect(config.excludeGlobs).toEqual(["**/.git/**"]);
  });

  test("CLI overrides take precedence over config file values", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    await writeFile(
      path.join(workspace, "context-hub.config.json"),
      JSON.stringify({ watch: false, reindexDebounceMs: 500 }),
      "utf8",
    );

    const config = await loadConfig({ cwd: workspace, watch: true, reindexDebounceMs: 100 });

    expect(config.watch).toBe(true);
    expect(config.reindexDebounceMs).toBe(100);
  });

  test("explicit config path overrides the default location", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    const customConfigPath = path.join(workspace, "custom.config.json");
    await writeFile(customConfigPath, JSON.stringify({ reindexDebounceMs: 999 }), "utf8");

    const config = await loadConfig({ cwd: workspace, config: customConfigPath });

    expect(config.configPath).toBe(customConfigPath);
    expect(config.reindexDebounceMs).toBe(999);
  });

  test("rejects unknown config keys", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    await writeFile(
      path.join(workspace, "context-hub.config.json"),
      JSON.stringify({ unknownKey: true }),
      "utf8",
    );

    await expect(loadConfig({ cwd: workspace })).rejects.toThrow();
  });

  test("rejects invalid config values", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    await writeFile(
      path.join(workspace, "context-hub.config.json"),
      JSON.stringify({ reindexDebounceMs: -1 }),
      "utf8",
    );

    await expect(loadConfig({ cwd: workspace })).rejects.toThrow();
  });
});
