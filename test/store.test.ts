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

describe("search() with metadata filters", () => {
  test("filters by tag", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    await writeContextFile(workspace, "domains/auth.md", `---
title: Auth
domain: auth
tags: [auth, security]
confidence: high
last_verified: 2026-01-01
---
# Auth
Authentication flow.
`);
    await writeContextFile(workspace, "domains/payments.md", `---
title: Payments
domain: payments
tags: [payments]
confidence: medium
last_verified: 2026-01-01
---
# Payments
Payment gateway.
`);

    const config = await loadConfig({ cwd: workspace });
    const store = await openContextStore(config);

    try {
      const results = await store.search("Authentication", { tags: ["auth"] });
      expect(results.every(r => r.tags.includes("auth"))).toBe(true);
    } finally {
      await store.close();
    }
  });

  test("filters by confidence level (high only)", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    await writeContextFile(workspace, "domains/high.md", `---
title: High Doc
domain: test
tags: []
confidence: high
last_verified: 2026-01-01
---
# High
High confidence content.
`);
    await writeContextFile(workspace, "domains/low.md", `---
title: Low Doc
domain: test
tags: []
confidence: low
last_verified: 2026-01-01
---
# Low
Low confidence content.
`);

    const config = await loadConfig({ cwd: workspace });
    const store = await openContextStore(config);

    try {
      const all = await store.search("confidence content");
      expect(all.length).toBeGreaterThanOrEqual(1);
      const filtered = await store.search("confidence content", { confidence: "high" });
      expect(filtered.every(r => r.confidence === "high")).toBe(true);
    } finally {
      await store.close();
    }
  });

  test("filters by verified_after date", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    await writeContextFile(workspace, "domains/old.md", `---
title: Old Doc
domain: test
tags: []
confidence: medium
last_verified: 2020-01-01
---
# Old
Old document content here.
`);
    await writeContextFile(workspace, "domains/new.md", `---
title: New Doc
domain: test
tags: []
confidence: medium
last_verified: 2026-01-01
---
# New
New document content here.
`);

    const config = await loadConfig({ cwd: workspace });
    const store = await openContextStore(config);

    try {
      const results = await store.search("document content here", { verified_after: "2025-01-01" });
      expect(results.every(r => r.lastVerified !== null && r.lastVerified > "2025-01-01")).toBe(true);
    } finally {
      await store.close();
    }
  });
});

describe("listTags()", () => {
  test("returns tags with counts sorted by count desc", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    await writeContextFile(workspace, "domains/a.md", `---
title: A
domain: test
tags: [auth, security]
confidence: high
last_verified: 2026-01-01
---
# A doc
`);
    await writeContextFile(workspace, "domains/b.md", `---
title: B
domain: test
tags: [auth]
confidence: high
last_verified: 2026-01-01
---
# B doc
`);

    const config = await loadConfig({ cwd: workspace });
    const store = await openContextStore(config);

    try {
      const tags = await store.listTags();
      const authTag = tags.find(t => t.tag === "auth");
      expect(authTag).toEqual({ tag: "auth", count: 2 });
      const secTag = tags.find(t => t.tag === "security");
      expect(secTag).toEqual({ tag: "security", count: 1 });
    } finally {
      await store.close();
    }
  });

  test("filters listTags() by domain", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    await writeContextFile(workspace, "auth/a.md", `---
title: A
domain: auth
tags: [auth-tag]
confidence: high
last_verified: 2026-01-01
---
# A
`);
    await writeContextFile(workspace, "payments/b.md", `---
title: B
domain: payments
tags: [payments-tag]
confidence: high
last_verified: 2026-01-01
---
# B
`);

    const config = await loadConfig({ cwd: workspace });
    const store = await openContextStore(config);

    try {
      const tags = await store.listTags("auth");
      expect(tags.some(t => t.tag === "auth-tag")).toBe(true);
      expect(tags.every(t => t.tag !== "payments-tag")).toBe(true);
    } finally {
      await store.close();
    }
  });
});
