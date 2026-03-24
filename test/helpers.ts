import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export async function createTempWorkspace(prefix = "context-hub-mcp-"): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}

export async function disposeWorkspace(workspace: string): Promise<void> {
  await rm(workspace, { recursive: true, force: true });
}

export async function writeContextFile(
  workspace: string,
  relativePath: string,
  content: string,
): Promise<string> {
  const fullPath = path.join(workspace, ".context", relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf8");
  return fullPath;
}

export function sampleFrontmatter(overrides: Partial<Record<string, string>> = {}): string {
  return `---
title: ${overrides.title ?? "Payment Rules"}
domain: ${overrides.domain ?? "payments"}
tags: [payments, line-pay]
last_verified: ${overrides.last_verified ?? "2026-03-24"}
confidence: ${overrides.confidence ?? "high"}
---
`;
}
