# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
