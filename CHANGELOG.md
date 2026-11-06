# Changelog

All notable changes to OpenMedia are documented here.

> **Format**: loosely based on [Keep a Changelog](https://keepachangelog.com/), grouped by date descending. Each entry references the originating PR (when available) and names the area from the conventional-commit prefix.
>
> **Wiki**: the [GitHub Wiki](https://github.com/skepjandi/openmedia/wiki) is the public-facing main wiki — architecture, recipe format, AI pipeline, security model, roadmap. Source-controlled editing surface is `docs/wiki/` in this repo; CI (`.github/workflows/sync-wiki.yml`) mirrors it to the GitHub Wiki on every merge to `main`. New single-PR changes belong here, not as new wiki pages.

## 2026-11-07

### docs: bootstrap agent rules, changelog, wiki, and roadmap

**What:** The repository had no contributor guidance, no documentation surface, and a generic Node `.gitignore`.

**Change:** Add `AGENTS.md` (wiki-first, worktree-only, architecture invariants for a no-backend BYOK app), this changelog, the `docs/wiki/` source tree with its sync workflow, and a phased roadmap. Extend `.gitignore` for Tauri/Rust, iOS/Android, signing material, and agent worktrees.

**PR:** n/a (initial bootstrap)

### docs: add logo and README

**What:** The project had no brand mark or README content.

**Change:** Add `assets/logo.svg`, reference it from `README.md` and the wiki index (absolute raw URL there, since relative paths do not resolve in the flattened GitHub Wiki), and plan icon generation in Phase 1.

**PR:** n/a
