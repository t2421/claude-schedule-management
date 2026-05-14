# Contributing

Thanks for considering a contribution! This project is small and we want to
keep the contribution loop short.

## Development setup

Requirements:

- macOS (launchd is required at runtime; the build itself works anywhere)
- Node 20+
- [`yq`](https://github.com/mikefarah/yq) (`brew install yq`)
- [`claude` CLI](https://docs.anthropic.com/claude/docs/claude-code)

```bash
git clone <your fork>
cd claude-schedule-management
npm install
npm run dev
```

This starts:

- Hono API on `http://127.0.0.1:7878`
- Vite dev server on `http://localhost:5173` (proxies `/api` to the API)

Edit code, save, reload.

## Project layout

```
server/   Hono backend (TypeScript)
web/      React frontend (Vite + TypeScript)
bin/      Shell scripts: runner, install, doctor
jobs/     User job YAMLs (gitignored except examples/)
plists/   Generated launchd plists (gitignored)
logs/     Per-job execution logs (gitignored)
```

## Coding conventions

- TypeScript everywhere, strict mode on
- Prefer small, focused modules (< 400 lines)
- No new runtime dependencies without discussion
- All UI strings go through `i18n` (English + Japanese minimum)
- Server validates input at the API boundary; client trusts the API

## Tests

```bash
npm test
```

When adding new logic to `server/src/lib/cron-to-cal.ts` or other pure
modules, please include unit tests.

## Pull requests

1. Branch from `main`
2. Keep PRs focused — one concern per PR
3. Update CHANGELOG.md under `## Unreleased`
4. CI must pass (typecheck + build + tests)

## Reporting bugs and proposing features

Use the GitHub issue templates. For security issues, see `SECURITY.md`.

## License

By contributing, you agree your contributions are licensed under the same
MIT license as the rest of the project.
