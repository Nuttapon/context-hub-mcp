---
name: context-hub-importer
description: Import external knowledge into a context-hub-mcp `.context/` folder. Use when the user wants to turn a URL, wiki page, spec document, Notion page, Confluence doc, or any external reference into a properly formatted `.context/*.md` file with correct YAML frontmatter (title, domain, tags, last_verified, confidence) placed in the right subdirectory (domains/, integrations/, pitfalls/). Triggers on phrases like "add this to context", "import this URL into context", "convert this spec to context", "add to .context folder", "document this in context-hub".
---

# Context Hub Importer

Converts external sources (URLs, wikis, specs, pasted text) into `.context/*.md` documents aligned with context-hub-mcp's schema.

Read [references/schema.md](references/schema.md) before proceeding — it defines required frontmatter, directory placement, and body conventions.

## Workflow

### 1. Fetch the source

- **URL** → use WebFetch to retrieve the content
- **File path** → use Read
- **Pasted text** → use as-is

### 2. Classify the document

Determine placement based on content:

| Content type | Directory |
|---|---|
| Business rules, workflows, state machines, domain logic | `domains/` |
| External APIs, auth flows, webhooks, rate limits, request/response shapes | `integrations/` |
| Gotchas, anti-patterns, "don't do X", post-mortems | `pitfalls/` |

When ambiguous, prefer `domains/`. Ask the user only if classification is genuinely unclear.

### 3. Extract and distill

Do NOT dump the raw source. Distill into what an AI agent needs to know:

- Strip marketing copy, navigation, changelogs, and boilerplate
- Keep: core rules, constraints, data shapes, failure modes, key concepts
- Preserve state machines, decision tables, and numbered sequences
- For long sources, split into multiple focused files rather than one large file

### 4. Infer frontmatter

| Field | How to determine |
|---|---|
| `title` | The main subject, short and specific |
| `domain` | Lowercase singular noun matching the content area (e.g., `payments`, `auth`, `orders`) |
| `tags` | 3–6 lowercase terms a developer would search for |
| `last_verified` | Today's date in `YYYY-MM-DD` format |
| `confidence` | `high` if source is official/stable, `medium` if inferred, `low` if uncertain |

### 5. Generate the filename

- kebab-case, descriptive: `stripe-webhook-events.md`, `order-state-machine.md`
- Prefix with domain if helpful for disambiguation: `auth-token-refresh.md`

### 6. Write the file

Use Write to create `.context/<subdir>/<filename>.md`.

Show the user:
- The full file path written
- A one-line summary of what was captured
- Any sections intentionally omitted and why

### 7. Offer to reindex

After writing, suggest: `npx context-hub-mcp reindex` to update the SQLite index.

## Multi-document sources

For a wiki or spec covering multiple distinct topics, propose splitting upfront:

```
I'll create 3 files from this:
- .context/integrations/stripe-webhooks.md — event types and verification
- .context/integrations/stripe-payouts.md — payout flow and timing
- .context/pitfalls/stripe-idempotency.md — idempotency key gotchas

Proceed?
```

## Quality checklist

Before writing, verify:
- [ ] Frontmatter has all 5 required fields
- [ ] `last_verified` is today's date
- [ ] Content is distilled, not dumped
- [ ] File goes in the right subdirectory
- [ ] Filename is kebab-case and descriptive
