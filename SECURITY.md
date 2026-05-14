# Security Policy

## Threat model

claude-schedule-management runs entirely on your local machine. It executes
prompts you have authored against the `claude` CLI, on your behalf, on a
schedule you control. Risks fall into three buckets:

1. **Local privilege**: the web service binds `127.0.0.1` only, with no
   authentication. Anything that can open a TCP connection to localhost as
   your user can create, edit, or trigger jobs. This is acceptable on a
   single-user developer machine but **not** on shared or multi-tenant hosts.

2. **Prompt content**: prompts run under your user account with your file
   system permissions. A malicious or careless prompt can do anything you can
   do interactively (delete files, push to repos, send messages via MCP, etc).
   Review prompts before saving.

3. **Working directory**: when a job sets a `working_directory`, the runner
   `cd`s into it before invoking Claude. Pick directories you trust.

## What we do

- Bind only to `127.0.0.1` (configurable, default refuses external connections)
- **Host-header allowlist** on every request — defeats DNS rebinding attacks
  where a malicious site resolves a hostname to `127.0.0.1` and tries to
  reach the local API from a browser tab
- Validate job names against `^[a-z0-9][a-z0-9-]*$`
- Validate launchd labels in orphan removal (`^[A-Za-z0-9][A-Za-z0-9._-]*$`,
  no `..`) so a crafted body can't delete arbitrary `.plist` files
- Require `working_directory` to be an absolute path without `..` segments
- Validate env var names (`^[A-Za-z_][A-Za-z0-9_]*$`) and reject newlines
  in env values and `claude_args` so the runner script can't be corrupted
- Reject path traversal in the logs API
- Use `spawn` (not shell) for all subprocess calls
- Strip the user's home directory from error messages returned over HTTP
- No telemetry, no outbound network calls from the management UI itself

## What we don't do

- No authentication on the management API (localhost-only is the perimeter)
- No sandboxing of Claude itself — it runs with your full user permissions
- No signature verification on YAML jobs — anything in `jobs/` is loaded
- **No allowlist on `claude_args`** — scheduled jobs typically need
  `--dangerously-skip-permissions` because there's no human to answer
  permission prompts. Treat `claude_args` as part of the trusted prompt and
  review jobs before applying them. Newlines / NUL bytes are still rejected.
- No protection against a co-resident attacker who can already write to your
  home directory. The plist symlink creation has a brief TOCTOU window which
  doesn't matter for a single-user laptop but would on a shared host.

## Reporting a vulnerability

If you find a security issue, please **do not** open a public GitHub issue.
Open a private security advisory via the repository's "Security" tab, or
email the maintainers listed in `package.json`.

We aim to acknowledge within 72 hours and patch critical issues within 14 days.
