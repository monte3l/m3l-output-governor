# Changelog

Releases are tagged `m3l-output-governor--vX.Y.Z`. None has been tagged yet: `plugin.json` carries `0.1.0` as the version the first release will have, and everything below is unreleased.

## Unreleased

- `marketplace.json`: the plugin entry's description now equals `plugin.json`'s, and `scripts/doc-parity.mjs` fails when the two differ.
- `plugin.json`: the description now matches the GitHub repository's, which the daily `docs-live` metadata check compares.
- Repository baseline: licence, REUSE, gitleaks, editorconfig, CODEOWNERS, workflow lint, dependency review, design marker (content tier, `v1.0.0`).
- `scripts/measure.mjs`: offline token baseline from session transcripts, with the exact thinking split.
- `evals/p4.mjs`: default versus Concise output style on Opus 5.5, with a dry run by default, and `evals/summarize.mjs` for the table and a seeded bootstrap interval. Result and data in `evals/`.
- CI: `verify.yml` now runs `claude plugin validate --strict .` with Claude Code pinned in `.github/ci-tools/`, with a Dependabot npm entry and a `SECURITY.md` that records the install-script risk.
- Plugin skill `/m3l-output-governor:measure`, and `measure.mjs` takes a project directory and `--project`.
- Scorecard workflow, a Dependabot entry for GitHub Actions (seven-day cooldown), a pull request template and a dependency-review licence exemption for the pinned Claude Code packages.
- `measure.mjs` now reads each session's `subagents/*.jsonl` when given a directory or `--project`, and reports `subagentFiles`. It rejects unknown `--` flags (including `--help` and `--gate=N`) with exit 2, reports a count of unreadable paths on stderr, and exits 2 when none could be read. Earlier numbers, including the 359-session baseline, excluded subagent transcripts.
- `evals/p4.mjs`: the fixture no longer includes `.claude/`, `UNVERIFIED.md`, `node_modules` or `tests/evals.test.mjs`, so the seeded bug is not described in the fixture and exactly one test fails. The runner stops at an error row without leaving its template directory behind.
- The measure skill's `allowed-tools` now pre-approves only the injected `measure.mjs` command, not any `node` command.
- `evals/p4.mjs`: the fixture copies tracked files only (an untracked or ignored file such as a local `.env` can no longer reach a run), and the T1 check accepts "every request after it" and "4 characters per token" style wording. Two further recorded runs are in `evals/p4-2026-10-19-run2.jsonl` and `-run3.jsonl`.
- Docs: the README field table, the `measure.mjs` and `p4.mjs` options, exit codes and the "8,000 characters or more" gate wording now match the code. `SECURITY.md` lists the accepted Scorecard findings.
- Docs site at output-governor.monte3l.com, built by the vendored m3l-design docs kit (`v1.1.0`, vendored tier) and deployed to Cloudflare Workers Static Assets. `scripts/doc-parity.mjs` fails the docs check when the README, `evals/results.md` or `UNVERIFIED.md` drift from the `measure.mjs` and `p4.mjs` code or from the committed eval runs. `plugin.json` gains `homepage`.
