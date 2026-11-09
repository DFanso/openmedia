# Contributing to OpenMedia

Read [AGENTS.md](AGENTS.md) first. It applies to humans and AI agents alike.

1. Read the relevant [wiki](docs/wiki/index.md) page before changing code.
2. Branch from `origin/main` (ideally in a git worktree under `.worktrees/`). Never commit to `main`.
3. Use conventional-commit prefixes (`feat(engine):`, `fix(ai):`, `docs(wiki):`).
4. All checks must pass before opening a PR:

```bash
yarn verify   # ts:check, lint, format:check, test, cargo fmt, clippy -D warnings, cargo test
```

5. Add a `CHANGELOG.md` entry; update the wiki if behavior or architecture changes.
6. Never commit secrets, and scrub personal data from fixtures.

## License

By contributing you agree your contributions are licensed under [MPL-2.0](LICENSE). Each source file is covered by the license via the repository `LICENSE`; no per-file header is required.
