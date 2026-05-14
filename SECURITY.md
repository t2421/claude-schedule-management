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
- Validate job names against `^[a-z0-9][a-z0-9-]*$`
- Reject path traversal in the logs API
- Use `spawn` (not shell) for all subprocess calls
- No telemetry, no outbound network calls from the management UI itself

## What we don't do

- No authentication on the management API (localhost-only is the perimeter)
- No sandboxing of Claude itself — it runs with your full user permissions
- No signature verification on YAML jobs — anything in `jobs/` is loaded

## Reporting a vulnerability

If you find a security issue, please **do not** open a public GitHub issue.
Open a private security advisory via the repository's "Security" tab, or
email the maintainers listed in `package.json`.

We aim to acknowledge within 72 hours and patch critical issues within 14 days.
