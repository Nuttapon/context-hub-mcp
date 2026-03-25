# Releasing `context-hub-mcp`

This repository is set up for manual npm publishing from a public GitHub repository.

## Before the first publish

- Make sure the GitHub repository is public.
- Make sure the npm package name `context-hub-mcp` is still available, or rename the package before publishing.
- Log in to npm on the machine you will publish from:

```bash
npm login
```

## Release steps

1. Review local changes and make sure the working tree is ready.
2. Bump the version in `package.json`.

```bash
npm version patch
```

Use `minor` or `major` instead of `patch` when appropriate.

3. Run the publish verification flow.

```bash
npm run prepublish-check
```

This runs:

- `npm test`
- `npm run typecheck`
- `npm run build`
- `npm pack --json`

4. Inspect the `npm pack --json` output.

Confirm that the tarball includes the expected publishable files:

- `dist/`
- `examples/`
- `README.md`
- `LICENSE`

Confirm that it does not include local runtime or release artifacts such as:

- `.context/context_hub.db`
- `.context/context_hub.db-shm`
- `.context/context_hub.db-wal`
- `*.tgz`

5. Push the release commit and tag to GitHub.

```bash
git push origin main --follow-tags
```

6. Publish to npm.

```bash
npm publish
```

## Notes

- `npm run prepublish-check` leaves a local `.tgz` tarball in the workspace. That file is ignored by `.gitignore`; remove it after inspection if you do not want to keep it locally.
- If packaging behavior changes, rerun `npm pack --json` and re-check the file list before publishing.
