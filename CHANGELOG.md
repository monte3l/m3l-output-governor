# Changelog

Releases are tagged `m3l-output-governor--vX.Y.Z`. The release workflow writes each new section from the Conventional Commits since the last release. See "Releasing" in CONTRIBUTING.md.

## 1.0.0 (2026-10-20)

The first release. It measures where Claude Code's output tokens go, from session transcripts, and records one paired eval of the built-in Concise output style. The public contract is the `measure.mjs` flags, exit codes and output fields, and the skill `/m3l-output-governor:measure`.

- **Breaking for anyone who installed before this release:** the plugin no longer ships its own `monte3l-output-governor` marketplace. Install it from the catalog, `/plugin marketplace add monte3l/m3l-plugins` then `/plugin install m3l-output-governor@monte3l`, after removing the old marketplace with `claude plugin marketplace remove monte3l-output-governor` so the plugin is not installed twice. The plugin name is unchanged, and its id becomes `m3l-output-governor@monte3l`. `scripts/doc-parity.mjs` no longer compares a marketplace entry's description, because there is no entry.
- `plugin-evals/`: two `claude plugin eval` cases for the skill, one that the skill's command runs `measure.mjs` through the installed plugin and one for the rule that Claude never starts the skill itself. Both passed on Haiku 5.5, Sonnet 5.5 and Opus 5.5. They are wired in through `experimental.evals` so the P4 files in `evals/` stay where they are, and the docs check and the P4 fixture both leave the directory out.
- `measure.mjs --project` now finds the transcripts when `CLAUDE_CONFIG_DIR` is set (and `CLAUDE_CODE_PROJECT_DIR_NAME` with it), where it looked only under `~/.claude` and exited 2, which aborts the skill. Found while investigating a `claude plugin eval` run; the eval sandbox still blocks that folder.
- `skills/measure/SKILL.md`: when the injected command was replaced by a note that it did not run (for example because a policy disabled shell commands), the skill now says so instead of reporting missing transcripts.
- Docs: how to update an installed plugin, what the plugin runs, the 30-day transcript retention, the tested Claude Code versions, and the managed-policy limits: `allowManagedPermissionRulesOnly` stops the skill, and the other policies tried do not.
- `plugin.json`: `version` is `1.0.0`, and the description now matches the GitHub repository's, which the daily `docs-live` metadata check compares.
- Repository baseline: licence, REUSE, gitleaks, editorconfig, CODEOWNERS, workflow lint, dependency review, and the m3l-design marker (now vendored tier, `v1.1.0`).
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
