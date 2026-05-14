# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **Host-header allowlist on every request** — defeats DNS rebinding from a
  browser tab that resolves an attacker domain to `127.0.0.1`. Configurable
  via `CLAUDE_SCHEDULE_EXTRA_HOSTS`.
- **Orphan removal label validation** (`^[A-Za-z0-9][A-Za-z0-9._-]*$`, no
  `..`) — closes a path-traversal-by-label that could delete arbitrary
  `.plist` files outside `~/Library/LaunchAgents`.
- **`working_directory` validation** — must be an absolute path with no `..`
  components.
- **Env var name / value validation** — names match `^[A-Za-z_][A-Za-z0-9_]*$`;
  values cannot contain newlines. Prevents corruption of the runner's
  KEY=VALUE parsing loop.
- **`claude_args` newline / NUL rejection** — flags still flow through but
  cannot carry control characters.
- **Error message sanitization** — the home directory is stripped from HTTP
  error responses.

### Changed

- Server reorganized into domain / application / infrastructure / interfaces
  layers (DDD + Clean Architecture). The domain layer is pure TypeScript with
  no `node:*` imports; infrastructure implements domain interfaces; use cases
  are factory functions that receive their dependencies; a single
  `composition.ts` wires everything. Public HTTP API is unchanged.
- Added value objects: `JobName`, `CronSchedule`. Validation is centralized in
  the domain rather than scattered across server modules.
- Added unit tests for `JobName` and `CronSchedule` (cron parser test moved to
  its new location).



- Orphan detection no longer requires the launchd label to start with the
  current `LABEL_PREFIX`. It identifies orphans by inspecting plist contents
  (does `ProgramArguments[0]` equal our `bin/runner.sh`?), which lets the UI
  surface and remove stale entries left behind by a previous label scheme.
- Orphan removal endpoint switched to `POST /api/jobs/orphans/remove`
  with `{ label }` in the body (labels contain dots).

### Added

- Initial release.
- YAML-defined jobs at `jobs/<name>.yaml`.
- Hono API on `127.0.0.1:7878` for CRUD, kickstart, log access, folder picker.
- React + Vite UI: list, edit form, log viewer.
- Cron preset dropdown (毎日 9:00, 平日 9:00, 15分毎, etc.) and free-form editing.
- Native macOS folder picker for `working_directory` via AppleScript.
- 5-field cron parser supporting `*`, `N`, `A,B,C`, `A-B`, `*/N`.
- Auto-injected PATH in generated job plists so `claude` and `yq` resolve.
- Per-user launchd agent for the web service (`bin/install-service.sh`).
- Orphan detection: surfaces launchd entries that have no YAML counterpart.
- i18n: English (default) and Japanese.
- MIT license, security policy, contributor docs.
