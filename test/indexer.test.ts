import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { loadConfig } from "../src/core/config.js";
import { scanContextDocuments } from "../src/core/indexer.js";
import { createTempWorkspace, disposeWorkspace, sampleFrontmatter, writeContextFile } from "./helpers.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(disposeWorkspace));
});

describe("scanContextDocuments", () => {
  test("parses markdown docs and applies defaults", async () => {
    const workspace = await createTempWorkspace();
    workspaces.push(workspace);

    await writeContextFile(
      workspace,
      "domains/payments.md",
      `${sampleFrontmatter({ title: "Payments" })}
# Payments

## Key Files

- \`src/payments/service.ts\` - entrypoint
`,
    );

    await writeContextFile(
      workspace,
      "pitfalls/line-pay.md",
      `---
title: LINE Pay Subunit
domain: payments
tags: [pitfall]
last_verified: 2026-03-24
---

# LINE Pay
`,
    );

    await writeContextFile(workspace, "broken.md", "# Missing frontmatter");

    const config = await loadConfig({ cwd: workspace });
    const result = await scanContextDocuments(config);

    expect(result.documents).toHaveLength(2);
    expect(result.errors).toHaveLength(1);

    expect(result.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "domains/payments.md",
          title: "Payments",
          domain: "payments",
          confidence: "high",
          tags: ["payments", "line-pay"],
        }),
        expect.objectContaining({
          path: "pitfalls/line-pay.md",
          confidence: "medium",
        }),
      ]),
    );

    expect(result.errors[0]).toEqual(
      expect.objectContaining({
        path: "broken.md",
      }),
    );

    expect(config.contextDir).toBe(path.join(workspace, ".context"));
  });
});
