# Security Policy

## Reporting a vulnerability

Do **not** open a public issue. Report privately through [GitHub private vulnerability reporting](https://github.com/skepjandi/openmedia/security/advisories/new).

Include affected version/platform, reproduction steps, and impact. Expect an acknowledgement within 7 days.

## Scope

The threat model is in [docs/wiki/security.md](docs/wiki/security.md). Of particular interest: anything that lets a site webview reach Tauri IPC, API-key exposure outside Rust, recipe/AI-output validation bypass, snapshot redaction failures, and profile isolation breaks.

## Supported versions

Only the latest release and `main`.
