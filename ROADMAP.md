# Roadmap

Tracks features that are intentionally out of scope for v0.x but desirable later.

## v0.1 (current)

- macOS / launchd only
- YAML-defined jobs, web UI for management
- 5-field cron syntax with presets
- Native folder picker via AppleScript
- English + Japanese UI (i18n)

## Planned

### Cross-platform scheduling backends

Abstract the scheduler so the same UI can target multiple OS-level backends.

- **Linux**: systemd user units with `OnCalendar=` timers
- **Windows**: Task Scheduler XML

The scheduling layer (`server/src/lib/launchctl.ts` + `plist.ts`) would be
refactored into a `SchedulerBackend` interface with implementations per OS.

### Run history database

Today the only history is per-day log files. A small SQLite table
(`runs(id, job_name, started_at, ended_at, exit_code, log_path)`) would let the
UI show:

- success rate over time
- average duration
- next scheduled run preview (requires a cron parser that can compute next-fire)

### Real-time log streaming (SSE)

Currently the UI polls every 2s. SSE would give true tail-f behavior.

### Job templates / sharing

Reusable job blueprints (e.g. "daily git pull and summarize"), exportable as a
gist or single YAML file that others can drop into `jobs/`.

### Authentication for non-localhost deployments

Currently the service binds `127.0.0.1` only. If users want to expose it on
a LAN or via a reverse tunnel, a simple bearer-token auth would be needed.

### Localizations beyond en/ja

i18n infrastructure is in place — adding `zh`, `ko`, `es`, etc. just needs
translation files.

## Non-goals

- Anything that requires a always-running cloud component
- Replacing professional schedulers (Airflow, Temporal, etc.) — this stays
  small and personal
