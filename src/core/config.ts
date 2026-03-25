import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { ContextHubConfig, LoadConfigOptions } from "./types.js";
import { fileExists } from "./utils.js";

const configSchema = z
  .object({
    contextDir: z.string().min(1).optional(),
    dbPath: z.string().min(1).optional(),
    watch: z.boolean().optional(),
    reindexDebounceMs: z.number().int().positive().optional(),
    includeGlobs: z.array(z.string().min(1)).optional(),
    excludeGlobs: z.array(z.string().min(1)).optional(),
  })
  .strict();

function resolveFrom(baseCwd: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(baseCwd, value);
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<ContextHubConfig> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const explicitConfigPath = options.config ? path.resolve(cwd, options.config) : null;
  const defaultConfigPath = path.resolve(cwd, "context-hub.config.json");

  const configPath =
    explicitConfigPath ?? ((await fileExists(defaultConfigPath)) ? defaultConfigPath : null);

  let fileConfig: z.infer<typeof configSchema> = {};

  if (configPath) {
    const raw = await readFile(configPath, "utf8");
    const parsedJson = JSON.parse(raw) as unknown;
    fileConfig = configSchema.parse(parsedJson);
  }

  const overrides = Object.fromEntries(
    Object.entries({
      contextDir: options.contextDir,
      dbPath: options.dbPath,
      watch: options.watch,
      reindexDebounceMs: options.reindexDebounceMs,
      includeGlobs: options.includeGlobs,
      excludeGlobs: options.excludeGlobs,
    }).filter(([, value]) => value !== undefined),
  ) as z.infer<typeof configSchema>;

  const merged = { ...fileConfig, ...overrides };

  const contextDir = resolveFrom(cwd, merged.contextDir ?? ".context");
  const dbPath = resolveFrom(cwd, merged.dbPath ?? path.join(".context", "context_hub.db"));
  const watch = merged.watch ?? true;
  const reindexDebounceMs = merged.reindexDebounceMs ?? 250;
  const includeGlobs = merged.includeGlobs ?? ["**/*.md"];
  const excludeGlobs = merged.excludeGlobs ?? ["**/.git/**"];

  return {
    cwd,
    configPath,
    contextDir,
    dbPath,
    watch,
    reindexDebounceMs,
    includeGlobs,
    excludeGlobs,
  };
}
