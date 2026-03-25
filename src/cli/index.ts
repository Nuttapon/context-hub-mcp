#!/usr/bin/env node

import process from "node:process";
import path from "node:path";
import { writeFile } from "node:fs/promises";

import { Command } from "commander";

import { loadConfig } from "../core/config.js";
import { runDoctor } from "../core/doctor.js";
import { isSupportedMcpTarget, renderMcpConfig, stringifyMcpConfig, supportedMcpTargets } from "../core/mcp-config.js";
import { runInitOnboarding } from "./onboarding.js";
import { initWorkspace } from "../core/scaffold.js";
import { openContextStore } from "../core/store.js";
import { startStdioServer } from "../transports/stdio/server.js";

type CommonOptions = {
  cwd?: string;
  config?: string;
  contextDir?: string;
  dbPath?: string;
};

type ConfigCommandOptions = {
  cwd?: string;
  target?: string;
  out?: string;
  name?: string;
  listTargets?: boolean;
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

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      process.stdout.write(`${result.message}\n`);
      return;
    }

    process.stdout.write(`${result.interactiveMessage}\n`);

    const onboarding = await runInitOnboarding(cwd);

    if (!onboarding.shouldRunReindex || !onboarding.target) {
      process.stdout.write("\nSetup skipped. You can run `reindex` and `config` later.\n");
      return;
    }

    const config = await resolveConfig({ cwd });
    const store = await openContextStore(config, { reindexOnOpen: false });

    try {
      const report = await store.reindex();
      process.stdout.write(
        `\nIndexed ${report.indexedCount} document(s). Parse errors: ${report.errors.length}.\n`,
      );
    } finally {
      await store.close();
    }

    const configContents = stringifyMcpConfig(renderMcpConfig(onboarding.target, cwd));

    process.stdout.write(`\nCopy this into your ${onboarding.target} MCP client config:\n\n`);
    process.stdout.write(configContents);
    process.stdout.write("\n");
    process.stdout.write("You do not need to run serve manually.\n");
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

program
  .command("config")
  .description("Generate MCP client config JSON")
  .option(
    "--target <name>",
    `Client target (${supportedMcpTargets.join(", ")})`,
  )
  .option("--cwd <path>", "Working directory for the generated MCP server entry", process.cwd())
  .option("--name <value>", "MCP server name", "context-hub")
  .option("--out <path>", "Write the generated JSON to a file")
  .option("--list-targets", "Print supported client targets")
  .action(async (options: ConfigCommandOptions) => {
    if (options.listTargets) {
      process.stdout.write(`${supportedMcpTargets.join("\n")}\n`);
      return;
    }

    if (!options.target) {
      throw new Error(`Missing required option "--target". Supported targets: ${supportedMcpTargets.join(", ")}.`);
    }

    if (!isSupportedMcpTarget(options.target)) {
      throw new Error(`Unsupported target "${options.target}". Supported targets: ${supportedMcpTargets.join(", ")}.`);
    }

    const cwd = path.resolve(options.cwd ?? process.cwd());
    const rendered = stringifyMcpConfig(renderMcpConfig(options.target, cwd, options.name ?? "context-hub"));

    if (options.out) {
      const outputPath = path.resolve(cwd, options.out);
      await writeFile(outputPath, rendered, "utf8");
      process.stdout.write(`Wrote MCP config to ${outputPath}\n`);
      return;
    }

    process.stdout.write(rendered);
  });

program.parseAsync(process.argv).catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
