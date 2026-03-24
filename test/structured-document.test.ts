import { describe, expect, test } from "vitest";

import { buildStructuredDocument } from "../src/core/structured-document.js";

describe("buildStructuredDocument", () => {
  test("extracts key files, state machines, sections, and pitfalls", () => {
    const structured = buildStructuredDocument(
      {
        path: "domains/payments.md",
        title: "Payments",
        domain: "payments",
        tags: ["payments"],
        confidence: "high",
        lastVerified: "2026-03-24",
        content: `# Payments

## Key Files

- \`src/payments/service.ts\` - payment entrypoint
- \`src/payments/line-pay.ts\` - LINE Pay adapter

## Payment State Machine

\`\`\`mermaid
stateDiagram-v2
  pending --> paid
\`\`\`
`,
      },
      [
        {
          path: "pitfalls/line-pay-subunit.md",
          title: "LINE Pay expects amount units",
          domain: "payments",
          tags: ["pitfall"],
          confidence: "high",
          lastVerified: "2026-03-24",
          content: "Convert subunits before API calls.",
        },
      ],
    );

    expect(structured.keyFiles).toEqual([
      {
        path: "src/payments/service.ts",
        description: "payment entrypoint",
      },
      {
        path: "src/payments/line-pay.ts",
        description: "LINE Pay adapter",
      },
    ]);

    expect(structured.stateMachines).toEqual([
      {
        section: "Payment State Machine",
        diagram: "stateDiagram-v2\n  pending --> paid",
      },
    ]);

    expect(structured.pitfalls).toHaveLength(1);
    expect(structured.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Key Files" }),
        expect.objectContaining({ title: "Payment State Machine" }),
      ]),
    );
  });
});
