# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**This file lives in `.claude/`, not the repository root.** The repository root is the plugin root, and `claude plugin validate --strict .` fails on a `CLAUDE.md` there.

## What this is

A Claude Code plugin that lowers the token cost of Claude Code's output side
without lowering the quality of the work. Today it does that by measurement
and one recorded eval: `scripts/measure.mjs` reads session transcripts and reports
where tokens go, and `evals/` holds a paired comparison of the built-in Concise
style, so the official levers (effort, a concise output style, subagents) are
chosen from data. It is a separate project from m3l-prompt-optimizer, which
rewrites typed prompts.

A tool-result shrinking hook was designed and **rejected**: over 359 real
sessions, Bash results of 8,000 characters or more carried about 2% of billed input
(`UNVERIFIED.md`, Closed item 2; re-measured with subagent transcripts in item 18: 2.4%). Do not rebuild it without rerunning
`scripts/measure.mjs` on a workload that clears 10% at the planned gate.

There is no package.json at the repository root, no build and no runtime dependency (the only
`package.json` files are in `.github/ci-tools/`, which pins the Claude Code that CI uses, and
`.github/deploy-tools/`, which pins the wrangler that deploys the docs site).
Scripts are plain Node `.mjs`. The README is the user-facing spec.
`UNVERIFIED.md` records what was confirmed by a live check and what is open.

## Commands

| Command | What it does |
| --- | --- |
| `node --test "tests/*.test.mjs"` | Runs the unit tests. Pass a file path to run one. A bare `tests/` directory does not work on Node 24 |
| `claude plugin validate --strict .` | Checks the plugin and marketplace manifests. CI runs the Claude Code version pinned in `.github/ci-tools/` (`npm ci --prefix .github/ci-tools`, then put its `node_modules/.bin` first on `PATH`) |
| `node design/source/docs-kit/build.mjs --check` | The docs site gate (writes nothing): links, every tracked `*.md` is a page or excluded with a reason, `design/SHA256SUMS`, the `design/local/` CSS rule, and `scripts/doc-parity.mjs`. CI runs it in `verify.yml` |
| `node design/source/docs-kit/build.mjs --out _site` | Builds the site locally. `_site/` is gitignored |
| `node scripts/doc-parity.mjs` | Only the doc-versus-code parity checks. Prints `ok` or each drift, exit 1 on drift |
| `node scripts/measure.mjs [--gate <chars>] [--project] <transcript.jsonl or directory…>` | Token baseline from session transcripts. `--project` means the current directory's transcript folder. Prints counts only |
| `node evals/summarize.mjs <results.jsonl>` | Prints the P4 table from result rows. Free, deterministic (seeded bootstrap) |
| `node evals/p4.mjs [--live]` | Default versus Concise on `claude-opus-5-5` at `medium`. **Without `--live` it is a dry run** that prints the plan and a cost estimate. `--live` spawns `claude -p` sessions and spends about $5 |
| `.github/bin/apply-repo-baseline.sh monte3l/m3l-output-governor` | Run from the `.github` repo checkout, read-only: compares this repository with the org baseline |

## Architecture

| File | Role |
| --- | --- |
| `scripts/measure.mjs` | `measure(files, { gateChars })` returns exact usage totals (including the thinking split from `usage.output_tokens_details.thinking_tokens`) and estimates derived from characters. The CLI wrapper parses arguments, resolves `--project` from the current directory, expands directories (including each session's `subagents/`), rejects unknown `--` flags with exit 2, and reports a count of unreadable paths on stderr |
| `tests/measure.test.mjs` | Synthetic transcripts: totals, duplicate message ids, the gate, the counts-only invariant, unreadable files, `expandPaths` (directories and `subagents/`), `projectDir`, and the CLI's flag handling and exit codes |
| `evals/p4.mjs` | `buildFixture()` makes a scratch copy (tracked files only) of this repo with a seeded `>` bug, two commits and an uncommitted diff; `TASKS` holds 8 prompts with objective checks; the runner pairs default and Concise runs, stops at the first error row and resumes past valid ones |
| `evals/summarize.mjs` | `summarize(rows)` pairs runs by task and rep, drops errored runs, and returns totals, per-task medians and bootstrap intervals (5000 resamples, fixed seed 12345). `pairUp`, `validRows` and `toMarkdown` are exported too |
| `evals/p4-2026-10-19.jsonl`, `-run2.jsonl`, `-run3.jsonl`, `evals/results.md` | The three recorded runs (counts only, no answer text) and their reading |
| `tests/evals.test.mjs` | Dry run spawns nothing, pairing and summary maths, the fixture, the task checks |
| `skills/measure/SKILL.md` | The plugin's one skill, `/m3l-output-governor:measure`. It injects `measure.mjs --project` output with the `!` shell syntax and has Claude interpret it. User-invoked only |
| `.claude-plugin/` | Plugin and marketplace manifests. One skill; no hooks, mods or output styles |
| `.github/ci-tools/` | `package.json` and lockfile pinning `@anthropic-ai/claude-code`; `verify.yml` installs it with its install script (an accepted risk, see `SECURITY.md`). Dependabot proposes bumps after a one-day cooldown |
| `scripts/doc-parity.mjs` | A kit parity module (listed in `docs.config.mjs` `parity`). Compares the README with `measure.mjs` flags, the gate default and the JSON field paths (flattened from `measure()` run on a synthetic transcript), with `p4.mjs` flags, defaults, task count, per-run caps and the dry-run plan, and with the result-row key count. It recomputes the committed `evals/p4-2026-10-19*.jsonl` runs through `summarize.mjs` and asserts every figure in `NUMBER_TABLE` (README Levers, `evals/results.md`, `UNVERIFIED.md` items 14, 17 and 19). It also checks the skill invocation and `disable-model-invocation`. `tests/doc-parity.test.mjs` covers its pure helpers |
| `docs.config.mjs` | The docs site config: pages, nav groups, `exclude` (each with a reason), the manifest, and the parity module |
| `.github/deploy-tools/`, `.github/workflows/docs.yml`, `docs-live.yml` | Cloudflare Workers Static Assets deploy (Worker `m3l-output-governor-docs`, `output-governor.monte3l.com`), the post-deploy smoke test and the daily live check with `--metadata` |
| `design/README.md` | The m3l-design marker, vendored tier. `design/source/`, `tokens.css` and `SHA256SUMS` are the verbatim copy |

Constraints that are not obvious from one file:

- **Output is counts only.** `measure.mjs` never prints prompt text, tool output or
  file paths from a transcript. `tests/measure.test.mjs` checks this with a planted
  secret; keep that test passing when changing the output.
- **Label every number exact or estimated.** Usage fields are exact. Anything
  derived from characters (characters divided by 4, re-read counts) is an estimate,
  and the re-read figure ignores compaction, so it overstates.
- **Count an assistant message once.** Transcripts can repeat a message id; the
  script de-duplicates on `message.id` (falling back to the row `uuid`), within each file.
- **A live eval never runs by default.** `evals/p4.mjs` is a dry run until `--live`, and it
  spends money on whichever credential `claude` resolves (a shell `ANTHROPIC_API_KEY` wins over
  the claude.ai login). Get approval for the cost first. A spend-limit error returns a zero-token
  400, so the runner stops at the first error row and `summarize.mjs` excludes errored runs.
- **A nested `node --test` inherits `NODE_TEST_CONTEXT` and then reports success.** Strip it from
  the child environment when a test or the runner spawns `node --test` (see `testsPass` in
  `evals/p4.mjs` and `tests/evals.test.mjs`).
- **Keep `disable-model-invocation: true` on the measure skill.** It reads the user's session
  history, so only the user may trigger it. Its `allowed-tools` pre-approves only
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/measure.mjs" *` (checked headless: that rule runs the
  injection, a non-matching one stops it with 0 turns); the skill report must stay counts only.
- **Claims about Claude Code behaviour cite a code.claude.com page** or are marked
  unconfirmed in `UNVERIFIED.md`.
- **No LLM rewriting of assistant prose, no `MessageDisplay` for savings, no
  editing of earlier turns.** Output tokens are billed when generated, and
  rewriting the past breaks the cached prefix.

## Docs and style

- The repository follows **m3l-design** at the **vendored tier** (see
  `design/README.md`; `Version copied`). `design/source/`, `design/tokens.css`
  and `design/SHA256SUMS` are a verbatim copy: never hand-edit them. Move to a
  newer release with `bin/sync-design.sh vX.Y.Z <repo>` from an `m3l-design`
  checkout, and never add a live `@monte3l/m3l-design` dependency.
- **The docs site** (`output-governor.monte3l.com`) is built by the vendored kit
  from `docs.config.mjs`. A page is on the site only if it is in `pages`; every
  other tracked `*.md` must be in `exclude` with a reason, or `--check` fails.
  **Fix the source page, never the kit** (a kit bug goes to `m3l-design`). The
  kit renders h1 to h3, tables, fenced code, lists, blockquotes and alerts,
  footnotes and images, with no raw HTML and no italics.
- `skills/measure/SKILL.md` is a site page ("Measure skill prompt"). The kit drops its
  YAML frontmatter, and `scripts/doc-parity.mjs` still reads the file itself.
- When you change a flag, a default, an output field or a quoted number, update
  the README (or `evals/results.md`) in the same commit. `doc-parity.mjs` names
  what drifted. A quoted number that comes from the committed runs belongs in
  `NUMBER_TABLE`; one that does not (the author's 36% thinking share, the 2% and
  2.4% baselines, the 359 sessions, post hoc re-scoring) cannot be derived and
  stays hand-kept.
- `tests/doc-parity.test.mjs`, `scripts/doc-parity.mjs`, `docs.config.mjs` and
  `design/source` are left out of the P4 fixture (`EXCLUDED` in `evals/p4.mjs`),
  so a docs-site file never changes what a live run sees.
- Bold, never italics or underlines; a GitHub alert matched to severity, at most
  two in a row, `[!CAUTION]` only for data loss or anything irreversible; plain
  direct sentences; tables for tabular data.
- When behaviour changes, update the README tables and, if a host behaviour is
  newly confirmed or open, `UNVERIFIED.md`.
- Run git, package and verify commands from inside this repository, never from the
  workspace root.
