import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { buildStructuredDocument } from "../core/structured-document.js";

import type { ContextStore } from "../core/store.js";

function textResult(text: string): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text }],
  };
}

function errorResult(message: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

export function registerTools(server: McpServer, store: ContextStore): void {
  server.registerTool(
    "list_domains",
    {
      description: "List available knowledge domains and document counts from the local context hub.",
    },
    async () => {
      try {
        const domains = await store.listDomains();

        if (domains.length === 0) {
          return textResult("No domains found. Initialize .context/ and reindex first.");
        }

        return textResult(
          `Available knowledge domains:\n\n${domains
            .map(domain => `- ${domain.domain} (${domain.count})`)
            .join("\n")}`,
        );
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "list_tags",
    {
      description: "List all unique tags in the context hub with document counts, optionally filtered by domain.",
      inputSchema: {
        domain: z.string().min(1).optional(),
      },
    },
    async args => {
      try {
        const tags = await store.listTags(
          typeof args.domain === "string" ? args.domain : undefined,
        );

        if (tags.length === 0) {
          return textResult("No tags found.");
        }

        return textResult(
          `Tags:\n\n${tags.map(t => `- ${t.tag} (${t.count})`).join("\n")}`,
        );
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "search_context",
    {
      description:
        "Search markdown-backed project knowledge for rules, architecture notes, state machines, and integration guidance.",
      inputSchema: {
        query: z.string().min(1),
        domain: z.string().min(1).optional(),
        limit: z.number().int().positive().max(50).optional(),
        tags: z.array(z.string().min(1)).optional(),
        confidence: z.enum(["high", "medium", "low"]).optional(),
        verified_after: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        verified_before: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      },
    },
    async args => {
      try {
        const searchOptions: Parameters<ContextStore["search"]>[1] = {};

        if (typeof args.domain === "string") searchOptions.domain = args.domain;
        if (typeof args.limit === "number") searchOptions.limit = args.limit;
        if (Array.isArray(args.tags) && args.tags.length > 0) searchOptions.tags = args.tags as string[];
        if (typeof args.confidence === "string") searchOptions.confidence = args.confidence as "high" | "medium" | "low";
        if (typeof args.verified_after === "string") searchOptions.verified_after = args.verified_after;
        if (typeof args.verified_before === "string") searchOptions.verified_before = args.verified_before;

        const results = await store.search(String(args.query), searchOptions);

        if (results.length === 0) {
          return textResult(`No results found for "${String(args.query)}".`);
        }

        return textResult(
          results
            .map(
              result =>
                `**${result.title}** (\`${result.path}\`)\nDomain: ${result.domain} | Confidence: ${result.confidence} | Last verified: ${result.lastVerified ?? "n/a"}\n\n${result.snippet}`,
            )
            .join("\n\n---\n\n"),
        );
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "get_context",
    {
      description:
        "Read a full context document by its relative path (use 'path' or 'document' parameter).",
      inputSchema: {
        path: z.string().min(1).optional(),
        document: z.string().min(1).optional(),
      },
    },
    async args => {
      try {
        const resolvedPath = (typeof args.path === "string" ? args.path : null) ??
          (typeof args.document === "string" ? args.document : null);

        if (!resolvedPath) {
          return errorResult("Missing required parameter: provide 'path' or 'document'.");
        }

        const doc = await store.get(resolvedPath);

        if (!doc) {
          return errorResult(`Document not found: ${resolvedPath}`);
        }

        return textResult(
          `# ${doc.title}\n\nPath: ${doc.path}\nDomain: ${doc.domain}\nTags: ${doc.tags.join(", ") || "(none)"}\nConfidence: ${doc.confidence}\nLast verified: ${doc.lastVerified ?? "n/a"}\n\n---\n\n${doc.content}`,
        );
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "get_context_structured",
    {
      description:
        "Read a context document as structured JSON-friendly data for agent chaining and downstream automation (use 'path' or 'document' parameter).",
      inputSchema: {
        path: z.string().min(1).optional(),
        document: z.string().min(1).optional(),
        include_related_pitfalls: z.boolean().optional(),
      },
    },
    async args => {
      try {
        const resolvedPath = (typeof args.path === "string" ? args.path : null) ??
          (typeof args.document === "string" ? args.document : null);

        if (!resolvedPath) {
          return errorResult("Missing required parameter: provide 'path' or 'document'.");
        }

        const document = await store.get(resolvedPath);

        if (!document) {
          return errorResult(`Document not found: ${resolvedPath}`);
        }

        const includePitfalls =
          typeof args.include_related_pitfalls === "boolean" ? args.include_related_pitfalls : true;
        const pitfalls = includePitfalls ? await store.getPitfalls(document.domain) : [];
        const related = await store.getRelated(document.path, 1);
        const structured = buildStructuredDocument(document, pitfalls, related);
        const structuredContent = structured as unknown as Record<string, unknown>;

        return {
          content: [
            {
              type: "text" as const,
              text: `Structured context for ${document.path}: ${structured.keyFiles.length} key file(s), ${structured.stateMachines.length} state machine(s), ${structured.pitfalls.length} related pitfall(s), ${structured.related.length} related doc(s).`,
            },
          ],
          structuredContent,
        };
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "get_pitfalls",
    {
      description: "List known pitfalls and gotchas, optionally filtered by domain.",
      inputSchema: {
        domain: z.string().min(1).optional(),
      },
    },
    async args => {
      try {
        const pitfalls = await store.getPitfalls(
          typeof args.domain === "string" ? args.domain : undefined,
        );

        if (pitfalls.length === 0) {
          return textResult("No pitfalls documented yet.");
        }

        return textResult(
          pitfalls
            .map(
              pitfall =>
                `## ${pitfall.title}\nPath: \`${pitfall.path}\` | Confidence: ${pitfall.confidence}\n\n${pitfall.content}`,
            )
            .join("\n\n---\n\n"),
        );
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "get_stale_docs",
    {
      description:
        "List context documents that may be outdated: last_verified is old or missing, or confidence is low.",
      inputSchema: {
        domain: z.string().min(1).optional(),
        days_threshold: z.number().int().positive().optional(),
        limit: z.number().int().positive().max(50).optional(),
      },
    },
    async args => {
      try {
        const staleOptions: { domain?: string; days_threshold?: number; limit?: number } = {};
        if (typeof args.domain === "string") staleOptions.domain = args.domain;
        if (typeof args.days_threshold === "number") staleOptions.days_threshold = args.days_threshold;
        if (typeof args.limit === "number") staleOptions.limit = args.limit;
        const docs = await store.getStaleDocs(staleOptions);

        if (docs.length === 0) {
          return textResult("No stale documents found.");
        }

        return textResult(
          `Stale or low-confidence documents:\n\n${docs
            .map(
              doc =>
                `- **${doc.title}** (\`${doc.path}\`) | Confidence: ${doc.confidence} | Last verified: ${doc.lastVerified ?? "never"} | Age: ${doc.daysSinceVerified !== null ? `${doc.daysSinceVerified} days` : "unknown"}`,
            )
            .join("\n")}`,
        );
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "get_related",
    {
      description:
        "Get documents related to a given context document. Relationships are bidirectional — if A lists B as related, querying B also returns A.",
      inputSchema: {
        path: z.string().min(1),
        depth: z.number().int().min(1).max(2).optional(),
      },
    },
    async args => {
      try {
        const related = await store.getRelated(
          String(args.path),
          typeof args.depth === "number" ? args.depth : 1,
        );

        if (related.length === 0) {
          return textResult(`No related documents found for ${String(args.path)}.`);
        }

        return textResult(
          `Related documents for ${String(args.path)}:\n\n${related
            .map(
              r =>
                `- **${r.title}** (\`${r.path}\`) | Domain: ${r.domain} | Confidence: ${r.confidence}`,
            )
            .join("\n")}`,
        );
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "annotate_context",
    {
      description: "Leave an annotation on a context document when it is missing, outdated, or unclear.",
      inputSchema: {
        path: z.string().min(1),
        note: z.string().min(1),
      },
    },
    async args => {
      try {
        await store.annotate(String(args.path), String(args.note));
        return textResult(`Annotation saved on ${String(args.path)}.`);
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "rate_context",
    {
      description: "Record whether a context document was helpful for the current task.",
      inputSchema: {
        path: z.string().min(1),
        helpful: z.boolean(),
        context: z.string().optional(),
      },
    },
    async args => {
      try {
        await store.rate(
          String(args.path),
          Boolean(args.helpful),
          typeof args.context === "string" ? args.context : undefined,
        );
        return textResult(
          `Rated ${String(args.path)} as ${args.helpful === true ? "helpful" : "not helpful"}.`,
        );
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "list_annotations",
    {
      description: "List annotations recorded against context documents.",
      inputSchema: {
        path: z.string().min(1).optional(),
      },
    },
    async args => {
      try {
        const annotations = await store.listAnnotations(
          typeof args.path === "string" ? args.path : undefined,
        );

        if (annotations.length === 0) {
          return textResult("No annotations found.");
        }

        return textResult(
          annotations
            .map(
              annotation =>
                `[${annotation.id}] **${annotation.documentPath}** — ${annotation.createdAt}\n${annotation.note}`,
            )
            .join("\n\n"),
        );
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "delete_annotation",
    {
      description: "Delete an annotation by its ID.",
      inputSchema: {
        id: z.number().int().positive(),
      },
    },
    async args => {
      try {
        await store.deleteAnnotation(Number(args.id));
        return textResult(`Annotation ${Number(args.id)} deleted.`);
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "reindex_context",
    {
      description: "Re-scan .context/ and rebuild the local SQLite index.",
    },
    async () => {
      try {
        const report = await store.reindex();
        return textResult(
          `Reindexed ${report.indexedCount} document(s). Parse errors: ${report.errors.length}.`,
        );
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  );
}
