# Context Hub Document Schema

## Frontmatter Fields

Every `.context/*.md` file requires YAML frontmatter:

```yaml
---
title: Payment Rules          # Human-readable title (required)
domain: payments              # Category string (required) — see domains below
tags: [payments, line-pay]    # Array of lowercase strings (required)
last_verified: 2026-03-28     # ISO date (required) — use today's date on creation
confidence: high              # "high" | "medium" | "low" (required)
---
```

**confidence guidelines:**
- `high` — verified, stable, unlikely to change soon
- `medium` — believed correct, not recently verified
- `low` — best-effort, needs validation

## Directory Structure

```
.context/
├── schema.md              # Meta — the schema itself
├── domains/               # Business rules, workflows, state machines
├── integrations/          # External system playbooks (APIs, queues, auth)
└── pitfalls/              # Gotchas, lessons learned, anti-patterns
```

**Placement rules:**
- `domains/` — core business logic, feature rules, state machines
- `integrations/` — third-party APIs, auth flows, request/response shapes, rate limits
- `pitfalls/` — "don't do X", failure post-mortems, non-obvious constraints

## Document Body Conventions

### Key Files section (optional, parsed by indexer)
```markdown
## Key Files

- `src/payments/service.ts` — Main entrypoint for payment processing
- `src/payments/types.ts` — Shared type definitions
```

### State Machine section (optional, parsed by indexer)
```markdown
## Order States

\`\`\`mermaid
stateDiagram-v2
  draft --> pending
  pending --> confirmed
  confirmed --> shipped
\`\`\`
```

### Pitfall document pattern
```markdown
---
title: Do Not Cache Auth Tokens in Redis Without TTL
domain: auth
tags: [auth, pitfall, redis]
last_verified: 2026-03-28
confidence: high
---

# Do Not Cache Auth Tokens in Redis Without TTL

**Problem:** Tokens cached without TTL persist after logout, allowing replay attacks.

**Solution:** Always set TTL equal to the token expiry.
```

## Naming Conventions

- File names: kebab-case, descriptive, e.g., `payment-lifecycle.md`, `stripe-webhooks.md`
- domain field: singular, lowercase, e.g., `payments`, `auth`, `orders`, `integrations`
- tags: plural or specific terms matching likely search queries
