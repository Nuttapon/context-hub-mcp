import { readFile } from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";
import { glob } from "tinyglobby";
import { z } from "zod";

import type { ContextDocument, ConfidenceLevel, ContextHubConfig, ScanResult } from "./types.js";

const frontmatterSchema = z.object({
  title: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  last_verified: z
    .union([z.string().min(1), z.date()])
    .transform(value => {
      if (value instanceof Date) {
        return value.toISOString().slice(0, 10);
      }

      return value;
    })
    .optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  related: z.array(z.string().min(1)).optional(),
});

function inferDomain(relativePath: string): string {
  const [firstSegment] = relativePath.split("/");
  return firstSegment === "." || !firstSegment ? "meta" : firstSegment;
}

function normalizeDocument(relativePath: string, rawContent: string): ContextDocument {
  if (!rawContent.trimStart().startsWith("---")) {
    throw new Error("No YAML frontmatter found");
  }

  const parsed = matter(rawContent);
  const meta = frontmatterSchema.parse(parsed.data);

  return {
    path: relativePath,
    title: meta.title ?? path.basename(relativePath, ".md"),
    domain: meta.domain ?? inferDomain(relativePath),
    tags: meta.tags ?? [],
    confidence: (meta.confidence ?? "medium") as ConfidenceLevel,
    content: parsed.content.trim(),
    lastVerified: meta.last_verified ?? null,
    related: meta.related ?? [],
  };
}

export async function scanContextDocuments(config: ContextHubConfig): Promise<ScanResult> {
  const relativePaths = await glob(config.includeGlobs, {
    cwd: config.contextDir,
    ignore: config.excludeGlobs,
    onlyFiles: true,
  });

  const documents: ContextDocument[] = [];
  const errors: ScanResult["errors"] = [];

  const results = await Promise.all(
    relativePaths.sort().map(async relativePath => {
      const absolutePath = path.join(config.contextDir, relativePath);
      try {
        const rawContent = await readFile(absolutePath, "utf8");
        return { relativePath, document: normalizeDocument(relativePath, rawContent), error: null };
      } catch (error) {
        return {
          relativePath,
          document: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  for (const result of results) {
    if (result.document) {
      documents.push(result.document);
    } else if (result.error !== null) {
      errors.push({ path: result.relativePath, message: result.error });
    }
  }

  return { documents, errors };
}
