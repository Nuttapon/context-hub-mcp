import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { loadConfig } from "../src/core/config.js";
import { openContextStore } from "../src/core/store.js";
import { createTempWorkspace, disposeWorkspace, sampleFrontmatter, writeContextFile } from "./helpers.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(disposeWorkspace));
});

describe("ContextStore", () => {
  test("can open without reindexing immediately when requested", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    await writeContextFile(
      workspace,
      "domains/payments.md",
      `${sampleFrontmatter({ title: "Payments" })}
# Payments
`,
    );

    const config = await loadConfig({ cwd: workspace });
    const store = await openContextStore(config, { reindexOnOpen: false });

    try {
      expect(await store.get("domains/payments.md")).toBeNull();

      await store.reindex();

      expect(await store.get("domains/payments.md")).toEqual(
        expect.objectContaining({
          path: "domains/payments.md",
        }),
      );
    } finally {
      await store.close();
    }
  });

  test("reindex is authoritative and search normalizes hyphenated queries", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    await writeContextFile(
      workspace,
      "domains/payments.md",
      `${sampleFrontmatter({ title: "Payments" })}
# Payments

LINE Pay integration requires amount conversion.
`,
    );

    await writeContextFile(
      workspace,
      "pitfalls/line-pay-subunit.md",
      `${sampleFrontmatter({ title: "LINE Pay Subunit", confidence: "high" })}
# Pitfall

Never send subunits directly to line-pay.
`,
    );

    const config = await loadConfig({ cwd: workspace });
    const store = await openContextStore(config);

    try {
      const initialSearch = await store.search("line-pay");
      expect(initialSearch).toHaveLength(2);

      await store.annotate("domains/payments.md", "Needs more examples");
      await store.rate("domains/payments.md", true, "payment update");

      await rm(path.join(workspace, ".context", "domains", "payments.md"));
      await store.reindex();

      expect(await store.get("domains/payments.md")).toBeNull();
      expect(await store.listAnnotations("domains/payments.md")).toEqual([]);

      const postDeleteSearch = await store.search("line-pay");
      expect(postDeleteSearch).toHaveLength(1);
      expect(postDeleteSearch[0]?.path).toBe("pitfalls/line-pay-subunit.md");
    } finally {
      await store.close();
    }
  });

  test("rejects annotations and ratings for unknown docs", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    await writeContextFile(
      workspace,
      "domains/subscriptions.md",
      `${sampleFrontmatter({ title: "Subscriptions", domain: "subscriptions" })}
# Subscriptions
`,
    );

    const config = await loadConfig({ cwd: workspace });
    const store = await openContextStore(config);

    try {
      await expect(store.annotate("domains/missing.md", "missing")).rejects.toThrow(/Document not found/i);
      await expect(store.rate("domains/missing.md", true)).rejects.toThrow(/Document not found/i);
    } finally {
      await store.close();
    }
  });

  test("multi-word search returns results", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    await writeContextFile(
      workspace,
      "domains/payments.md",
      `${sampleFrontmatter({ title: "LINE Pay Integration" })}
# LINE Pay Integration

This document describes the LINE Pay integration flow.
`,
    );

    const config = await loadConfig({ cwd: workspace });
    const store = await openContextStore(config);

    try {
      const results = await store.search("LINE Pay integration");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.title).toBe("LINE Pay Integration");
    } finally {
      await store.close();
    }
  });

  test("symbol-only search query throws meaningful error", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    const config = await loadConfig({ cwd: workspace });
    const store = await openContextStore(config, { reindexOnOpen: false });

    try {
      await expect(store.search("---")).rejects.toThrow(/must contain letters or numbers/i);
      await expect(store.search("???")).rejects.toThrow(/must contain letters or numbers/i);
      await expect(store.search("@#$")).rejects.toThrow(/must contain letters or numbers/i);
    } finally {
      await store.close();
    }
  });

  test("deleteAnnotation removes an annotation and rejects unknown IDs", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    await writeContextFile(
      workspace,
      "domains/payments.md",
      `${sampleFrontmatter({ title: "Payments" })}
# Payments
`,
    );

    const config = await loadConfig({ cwd: workspace });
    const store = await openContextStore(config);

    try {
      await store.annotate("domains/payments.md", "Needs examples");
      const annotations = await store.listAnnotations("domains/payments.md");
      expect(annotations).toHaveLength(1);
      expect(annotations[0]?.id).toBeTypeOf("number");

      await store.deleteAnnotation(annotations[0]!.id);
      const afterDelete = await store.listAnnotations("domains/payments.md");
      expect(afterDelete).toHaveLength(0);

      await expect(store.deleteAnnotation(99999)).rejects.toThrow(/Annotation not found/i);
    } finally {
      await store.close();
    }
  });
});
