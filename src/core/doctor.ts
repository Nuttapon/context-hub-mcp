import { access, constants, readFile } from "node:fs/promises";
import path from "node:path";

import type { ContextHubConfig } from "./types.js";

import { scanContextDocuments } from "./indexer.js";
import { fileExists } from "./utils.js";

async function writable(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function runDoctor(config: ContextHubConfig): Promise<string> {
  const contextDirExists = await fileExists(config.contextDir);
  const contextGitignorePath = path.join(config.contextDir, ".gitignore");
  const contextGitignoreExists = await fileExists(contextGitignorePath);
  const gitignoreContent = contextGitignoreExists
    ? await readFile(contextGitignorePath, "utf8")
    : "";
  const hasDbIgnores =
    gitignoreContent.includes("context_hub.db") &&
    gitignoreContent.includes("context_hub.db-shm") &&
    gitignoreContent.includes("context_hub.db-wal");
  const sqliteWritable = contextDirExists
    ? await writable(path.dirname(config.dbPath))
    : false;
  const scan = contextDirExists
    ? await scanContextDocuments(config)
    : {
        documents: [],
        errors: [],
      };

  const lines = [
    `Context directory: ${contextDirExists ? config.contextDir : "missing"}`,
    `SQLite path: ${config.dbPath}`,
    `SQLite writable: ${sqliteWritable ? "ok" : "missing"}`,
    `Context .gitignore: ${contextGitignoreExists ? "present" : "missing"}`,
    `SQLite ignore rules: ${hasDbIgnores ? "ok" : "missing"}`,
    `Documents indexed: ${scan.documents.length}`,
    `Parse errors: ${scan.errors.length}`,
  ];

  if (scan.errors.length > 0) {
    lines.push("");
    lines.push("Parse error details:");

    for (const error of scan.errors) {
      lines.push(`- ${error.path}: ${error.message}`);
    }
  }

  return lines.join("\n");
}
