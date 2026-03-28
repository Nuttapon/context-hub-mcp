import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { input, select } from "@inquirer/prompts";

import type { ContextStore } from "../core/store.js";

const TEMPLATES = {
  domain: (vars: TemplateVars): string =>
    `---
title: ${vars.title}
domain: ${vars.domain}
tags: [${vars.tags.join(", ")}]
confidence: ${vars.confidence}
last_verified: ${vars.today}
---

# ${vars.title}

## Overview

## Key Files

## Notes
`,
  integration: (vars: TemplateVars): string =>
    `---
title: ${vars.title}
domain: ${vars.domain}
tags: [${vars.tags.join(", ")}]
confidence: ${vars.confidence}
last_verified: ${vars.today}
---

# ${vars.title}

## Overview

## Setup

## Key Files

## Gotchas
`,
  pitfall: (vars: TemplateVars): string =>
    `---
title: ${vars.title}
domain: ${vars.domain}
tags: [${vars.tags.join(", ")}]
confidence: ${vars.confidence}
last_verified: ${vars.today}
---

# ${vars.title}

## Problem

## Root Cause

## Solution

## Example
`,
} as const;

type TemplateName = keyof typeof TEMPLATES;

interface TemplateVars {
  title: string;
  domain: string;
  tags: string[];
  confidence: string;
  today: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toTitleCase(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function openInEditor(filePath: string): Promise<void> {
  const editor = process.env.EDITOR ?? process.env.VISUAL;
  if (!editor) return;

  await new Promise<void>((resolve, reject) => {
    const child = spawn(editor, [filePath], { stdio: "inherit" });
    child.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`Editor exited with code ${code}`));
    });
  });
}

export interface AddOptions {
  contextDir: string;
  domain?: string;
  title?: string;
  tags?: string;
  confidence?: string;
  template?: string;
  edit?: boolean;
  store?: ContextStore;
  filePath?: string;
}

export async function runAddCommand(options: AddOptions): Promise<void> {
  const isTTY = process.stdin.isTTY === true && process.stdout.isTTY === true;

  // Resolve domain
  let domain = options.domain;
  if (!domain) {
    if (!isTTY) throw new Error("--domain is required in non-interactive mode");
    const existingDomains = options.store
      ? (await options.store.listDomains()).map(d => d.domain)
      : [];
    const choices = [
      ...existingDomains.map(d => ({ name: d, value: d })),
      { name: "(new domain)", value: "__new__" },
    ];
    const selected = await select({ message: "Select domain:", choices });
    if (selected === "__new__") {
      domain = await input({ message: "Enter new domain name:" });
    } else {
      domain = selected;
    }
  }

  if (!/^[a-z0-9-]+$/i.test(domain)) {
    throw new Error(
      `Invalid domain name "${domain}". Use only letters, numbers, and hyphens.`,
    );
  }

  // Resolve filename and full target path
  let filename: string;
  let targetRelPath: string;

  if (options.filePath) {
    // e.g. "auth/new-flow.md" or just "new-flow.md"
    const normalized = options.filePath.endsWith(".md")
      ? options.filePath
      : `${options.filePath}.md`;
    filename = path.basename(normalized, ".md");
    targetRelPath = normalized.includes("/") ? normalized : `${domain}/${normalized}`;
  } else if (!isTTY) {
    // Non-interactive: derive from title if provided
    if (!options.title) {
      throw new Error(
        "Either a file path argument or --title is required in non-interactive mode",
      );
    }
    filename = slugify(options.title);
    targetRelPath = `${domain}/${filename}.md`;
  } else {
    const rawFilename = await input({ message: "Filename (e.g. my-feature.md):" });
    filename = path.basename(rawFilename.endsWith(".md") ? rawFilename : `${rawFilename}.md`, ".md");
    targetRelPath = `${domain}/${filename}.md`;
  }

  const absolutePath = path.join(options.contextDir, targetRelPath);

  if (await fileExists(absolutePath)) {
    throw new Error(`File already exists: ${absolutePath}`);
  }

  // Resolve title
  const title =
    options.title ??
    (isTTY ? await input({ message: "Title:", default: toTitleCase(filename) }) : toTitleCase(filename));

  // Resolve tags
  const rawTags =
    options.tags ??
    (isTTY ? await input({ message: "Tags (comma-separated, optional):", default: "" }) : "");
  const tags = rawTags
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);

  // Resolve confidence
  const confidence =
    options.confidence ??
    (isTTY
      ? await select({
          message: "Confidence:",
          choices: [
            { name: "medium", value: "medium" },
            { name: "high", value: "high" },
            { name: "low", value: "low" },
          ],
        })
      : "medium");

  // Resolve template
  const templateName =
    (options.template ??
      (isTTY
        ? await select({
            message: "Template:",
            choices: [
              { name: "domain (general knowledge)", value: "domain" },
              { name: "integration (third-party service)", value: "integration" },
              { name: "pitfall (common mistake)", value: "pitfall" },
            ],
          })
        : "domain")) as TemplateName;

  if (!(templateName in TEMPLATES)) {
    throw new Error(
      `Unknown template "${templateName}". Choose from: ${Object.keys(TEMPLATES).join(", ")}`,
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const vars: TemplateVars = { title, domain, tags, confidence, today };
  const content = TEMPLATES[templateName](vars);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");

  process.stdout.write(`Created: ${absolutePath}\n`);

  if (options.edit !== false && isTTY) {
    await openInEditor(absolutePath);
  }
}
