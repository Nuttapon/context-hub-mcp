# AGENTS.md

`context-hub-mcp` is a standalone TypeScript MCP server for project knowledge stored in `.context/*.md`.

## Core Model

- Treat `.context/*.md` as the shared source of truth.
- Treat `.context/context_hub.db` as a local derived index and feedback store only.
- Keep the project generic across stacks. Do not hardcode Lemongrass, Phoenix, or app-specific assumptions into code, examples, or docs.

## Repo Map

- `src/cli/` contains the public commands: `init`, `reindex`, `doctor`, `serve`
- `src/core/` contains config loading, indexing, SQLite storage, doctor checks, structured parsing, and file watching
- `src/tools/` contains MCP tool registration and handlers
- `src/transports/stdio/` contains the local stdio MCP server transport
- `test/` contains regression and integration coverage
- `examples/` contains client configuration examples referenced by the README

## Working Rules

- Edit source under `src/`. Do not hand-edit `dist/`.
- Keep the product local-first and stdio-first unless a change is explicitly about adding another transport.
- Keep `doctor` diagnostic and read-only. It should not create `.context/`, SQLite files, or other workspace state.
- Keep `reindex` authoritative. It should sync removals, clean orphan metadata, and avoid duplicate rebuild work.
- Keep search tolerant of natural queries, including punctuation and hyphenated terms.
- Reject annotations and feedback for documents that are not currently indexed.

## Documentation Rules

- If you change CLI behavior, MCP tools, config shape, or generated scaffold output, update `README.md` in the same change.
- If `README.md` references example config files, keep those files in `examples/` and ensure packaging still includes them.
- When adding or renaming tools, keep tool descriptions generic and stack-agnostic.

## Verification

Run these before considering work complete:

- `npm test`
- `npm run typecheck`
- `npm run build`

Also run `npm pack --json` when a change affects packaging, published files, or README-linked examples.

## Packaging Notes

- Do not commit local runtime artifacts such as `.context/context_hub.db`, WAL/SHM files, or generated `.tgz` tarballs.
- If you change `package.json` `files`, examples, or README packaging instructions, verify the tarball contents explicitly.
