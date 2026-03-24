import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const CONTEXT_GITIGNORE = `context_hub.db
context_hub.db-shm
context_hub.db-wal
`;

const CONFIG_JSON = `{
  "contextDir": ".context",
  "dbPath": ".context/context_hub.db",
  "watch": true,
  "reindexDebounceMs": 250,
  "includeGlobs": ["**/*.md"],
  "excludeGlobs": ["**/.git/**"]
}
`;

const SCHEMA_MD = `---
title: Context Hub Schema
domain: meta
tags: [schema, context-hub]
last_verified: 2026-03-24
confidence: high
---

# Context Hub Schema

Every document in \`.context/\` should include YAML frontmatter:

\`\`\`yaml
---
title: Payment Rules
domain: payments
tags: [payments, line-pay]
last_verified: 2026-03-24
confidence: high
---
\`\`\`

Recommended directories:

- \`domains/\` for business rules and state machines
- \`integrations/\` for external system playbooks
- \`pitfalls/\` for gotchas and lessons learned
`;

const EXAMPLE_DOMAIN = `---
title: Example Domain
domain: example
tags: [example, workflow]
last_verified: 2026-03-24
confidence: medium
---

# Example Domain

## Key Files

- \`src/example/service.ts\` - Main entrypoint for this domain

## Example State Machine

\`\`\`mermaid
stateDiagram-v2
  draft --> active
  active --> archived
\`\`\`
`;

const EXAMPLE_INTEGRATION = `---
title: Example Integration
domain: integrations
tags: [integration, example]
last_verified: 2026-03-24
confidence: medium
---

# Example Integration

Document request/response shapes, auth requirements, rate limits, and failure modes here.
`;

const EXAMPLE_PITFALL = `---
title: Example Pitfall
domain: example
tags: [pitfall, example]
last_verified: 2026-03-24
confidence: high
---

# Example Pitfall

Capture gotchas that are expensive to rediscover.
`;

async function exists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function writeIfMissing(targetPath: string, content: string, created: string[]): Promise<void> {
  if (await exists(targetPath)) {
    return;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content, "utf8");
  created.push(targetPath);
}

export async function initWorkspace(cwd: string): Promise<{ created: string[]; message: string }> {
  const created: string[] = [];

  await writeIfMissing(path.join(cwd, ".context", ".gitignore"), CONTEXT_GITIGNORE, created);
  await writeIfMissing(path.join(cwd, ".context", "schema.md"), SCHEMA_MD, created);
  await writeIfMissing(
    path.join(cwd, ".context", "domains", "example-domain.md"),
    EXAMPLE_DOMAIN,
    created,
  );
  await writeIfMissing(
    path.join(cwd, ".context", "integrations", "example-integration.md"),
    EXAMPLE_INTEGRATION,
    created,
  );
  await writeIfMissing(
    path.join(cwd, ".context", "pitfalls", "example-pitfall.md"),
    EXAMPLE_PITFALL,
    created,
  );
  await writeIfMissing(path.join(cwd, "context-hub.config.json"), CONFIG_JSON, created);

  return {
    created,
    message: [
      "Initialized Context Hub workspace.",
      "",
      "Next steps:",
      "1. Edit .context/ documents for your project.",
      "2. Run `npx context-hub-mcp reindex` to build the local SQLite index.",
      "3. Point your MCP client at `npx context-hub-mcp serve`.",
    ].join("\n"),
  };
}
