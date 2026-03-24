#!/usr/bin/env node

import process from "node:process";
import path from "node:path";

import { Command } from "commander";

import { loadConfig } from "../core/config.js";
import { runDoctor } from "../core/doctor.js";
import { initWorkspace } from "../core/scaffold.js";
import { openContextStore } from "../core/store.js";
import { startStdioServer } from "../transports/stdio/server.js";

type CommonOptions = {
  cwd?: string;
  config?: string;
  contextDir?: string;
  dbPath?: string;
};

function applyCommonOptions(command: Command): Command {
  return command
    .option("--cwd <path>", "Working directory", process.cwd())
    .option("--config <path>", "Path to context-hub.config.json")
    .option("--context-dir <path>", "Override context directory")
    .option("--db-path <path>", "Override SQLite DB path");
}

async function resolveConfig(options: CommonOptions & { watch?: boolean }): Promise<Awaited<ReturnType<typeof loadConfig>>> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const loadOptions: CommonOptions & { cwd: string; watch?: boolean } = { cwd };

  if (options.config !== undefined) {
    loadOptions.config = options.config;
  }

  if (options.contextDir !== undefined) {
    loadOptions.contextDir = options.contextDir;
  }

  if (options.dbPath !== undefined) {
    loadOptions.dbPath = options.dbPath;
  }

  if (options.watch !== undefined) {
    loadOptions.watch = options.watch;
  }

  return loadConfig(loadOptions);
}

const program = new Command();

program.name("context-hub-mcp").description("Standalone .context-first MCP server").version("0.1.0");

applyCommonOptions(program.command("init").description("Scaffold a .context workspace")).action(
  async (options: CommonOptions) => {
    const cwd = path.resolve(options.cwd ?? process.cwd());
    const result = await initWorkspace(cwd);

    process.stdout.write(`${result.message}\n`);
  },
);

applyCommonOptions(program.command("reindex").description("Rebuild the local SQLite index")).action(
  async (options: CommonOptions) => {
    const config = await resolveConfig(options);
    const store = await openContextStore(config, { reindexOnOpen: false });

    try {
      const report = await store.reindex();
      process.stdout.write(
        `Indexed ${report.indexedCount} document(s). Parse errors: ${report.errors.length}.\n`,
      );
    } finally {
      await store.close();
    }
  },
);

applyCommonOptions(program.command("doctor").description("Inspect workspace health")).action(
  async (options: CommonOptions) => {
    const config = await resolveConfig(options);
    const report = await runDoctor(config);
    process.stdout.write(`${report}\n`);
  },
);

applyCommonOptions(
  program
    .command("serve")
    .description("Run the MCP server over stdio")
    .option("--no-watch", "Disable file watching"),
).action(async (options: CommonOptions & { watch: boolean }) => {
  const config = await resolveConfig(options);
  const server = await startStdioServer(config);

  const shutdown = async (): Promise<void> => {
    await server.close();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown();
  });

  process.once("SIGTERM", () => {
    void shutdown();
  });

  process.stdin.on("end", () => {
    void shutdown();
  });
});

program.parseAsync(process.argv).catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
