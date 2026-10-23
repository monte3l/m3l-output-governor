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
| `node --test --experimental-test-coverage --test-coverage-include="scripts/**" --test-coverage-include="evals/**" --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 "tests/*.test.mjs"` | The unit tests with the 80% coverage gate that `verify.yml` enforces (OpenSSF Silver). It measures about 90% lines today. CI also runs `editorconfig-checker -disable-indent-size` over tracked files, skipping `design/source/`, `design/tokens.css`, `design/SHA256SUMS`, `*.jsonl` and lockfiles |
| `claude plugin validate --strict .` | Checks the plugin manifest. CI runs the Claude Code version pinned in `.github/ci-tools/` (`npm ci --prefix .github/ci-tools`, then put its `node_modules/.bin` first on `PATH`) |
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
| `plugin-evals/` | `claude plugin eval` cases for the skill (a `prompt.md` and `graders/*.md` each), found through `experimental.evals` in `plugin.json` because `evals/` holds the P4 files. Free graders only (`regex`, `tool_used`). A run is billed and its sandbox cannot read the home directory, so it cannot reach the transcript path (`UNVERIFIED.md` item 5). Results land in `plugin-evals/results/`, gitignored |
| `.claude-plugin/` | The plugin manifest. There is no `marketplace.json`: the plugin is listed in the `monte3l/m3l-plugins` catalog. One skill; no hooks, mods or output styles |
| `.claude/` | The working harness for this repository: settings, hooks, agents, rules and skills for the people and agents who change it. It is not the plugin's own surface, which stays at the root (`skills/`, `.claude-plugin/`). See "Harness" below |
| `.github/ci-tools/` | `package.json` and lockfile pinning `@anthropic-ai/claude-code`; the `plugin` lane of `verify.yml` installs it with its install script (an accepted risk, see `SECURITY.md`). Dependabot proposes bumps after a one-day cooldown |
| `scripts/doc-parity.mjs` | A kit parity module (listed in `docs.config.mjs` `parity`). Compares the README with `measure.mjs` flags, the gate default and the JSON field paths (flattened from `measure()` run on a synthetic transcript), with `p4.mjs` flags, defaults, task count, per-run caps and the dry-run plan, and with the result-row key count. It recomputes the committed `evals/p4-2026-10-19*.jsonl` runs through `summarize.mjs` and asserts every figure in `NUMBER_TABLE` (README Levers, `evals/results.md`, `UNVERIFIED.md` items 14, 17 and 19). It also checks the skill invocation and `disable-model-invocation`. `tests/doc-parity.test.mjs` covers its pure helpers |
| `docs.config.mjs` | The docs site config: pages, nav groups, `exclude` (each with a reason), the manifest, and the parity module |
| `.github/deploy-tools/`, `.github/workflows/docs.yml`, `docs-live.yml` | Cloudflare Workers Static Assets deploy (Worker `m3l-output-governor-docs`, `output-governor.monte3l.com`), the post-deploy smoke test and the daily live check with `--metadata` |
| `.github/workflows/labeler.yml`, `.github/labeler.yml` | Labels each PR by area (`area:ci`, `docs`, `design`, `harness` from the org blueprint; `area:plugin`, `area:evals` specific to this repo) with `actions/labeler`. Labels only, not a required check. The labels already exist on GitHub, so a new rule needs its label created first |
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

## Harness

Everything here lives under `.claude/`, which `evals/p4.mjs` (`EXCLUDED`) and
`docs.config.mjs` (`exclude`) both leave out, so none of it changes what a live eval
run sees or fails the docs check. There is no root `bin/`, `docs/` or `CLAUDE.md`: a
root `CLAUDE.md` fails `claude plugin validate --strict .`, and `bin/` and `docs/` are
not excluded from the eval fixture. Put harness files under `.claude/`, never beside it.

| Path | What it does |
| --- | --- |
| `.claude/settings.json` | Denies reading `.env*` and `secrets/**`, registers the hooks below (every PreToolUse guard fails closed, see "If a guard breaks"), sets the status line, and enables the project plugins (each needs one `claude plugin install <id> --scope project`) |
| `.claude/hooks/guard-branch-isolation.mjs` | Blocks writes to `scripts/`, `evals/`, `tests/`, `skills/` and `.claude-plugin/` while HEAD is `main`. Its path set is `.claude/hooks/lib/protected-paths.mjs` |
| `.claude/hooks/guard-git-push-signed.mjs` | Blocks a `git push` that contains unsigned commits. Uses `.claude/hooks/lib/signed-range.mjs` |
| `.claude/hooks/guard-no-commonjs.mjs`, `guard-secret-writes.mjs`, `guard-double-background.mjs` | Block `require`/`module.exports`, writes of `.env*` or secret-shaped values, and a background command that also detaches itself |
| `.claude/hooks/guard-readonly-bash.mjs` | Holds the read-only agents to an **allowlist** of read-only commands: no `$` expansion, substitution, shell assignment, secrets path or write redirect, and only the verbs it names. It covers only the agents defined in `.claude/agents/` (the roster is `.claude/hooks/lib/agent-roster.mjs`, empty: no agent here writes). The main session, `general-purpose` and plugin agents are not checked |
| `.claude/hooks/guard-bash-writes.mjs` | The Bash side of the secret-write and branch guards, for every session: refuses a command that names or writes a secrets path (a dotenv file, a key, `~/.ssh`, also through a glob or `HEAD:.env`) or carries a secret literal, and, while HEAD is `main`, a command that is not read-only and names a guarded directory. It looks inside `$(...)`, backticks, `sh -c` strings and interpreter code, follows `cd`, and expands globs (`**` too). A heredoc body is data unless a shell or interpreter shares the line with its marker (`bash <<EOF`, `cat <<EOF | python3`), and then it is code. The read-only guard refuses any heredoc and any unquoted `{` that opens no group. It cannot see a command that writes into a guarded directory without naming it |
| `.claude/tests/guard-readonly-bash.test.mjs`, `guard-bash-writes.test.mjs`, `settings.test.mjs` | Regression tests for the two Bash guards, mutation-tested, and integrity tests for `.claude/settings.json`: every registered hook exists and imports, every PreToolUse guard fails closed, none crashes on a malformed payload, and each still blocks what it exists to block. Not under `tests/`, where the eval fixture would see a second failing test. The `checks` lane of `verify.yml` runs them; run `node --test ".claude/tests/*.test.mjs"` after any change to a hook or to `settings.json` |
| `.claude/hooks/inject-decision-gate.mjs` | Reminds about branch and PR before change work. Advisory, never blocks |
| `.claude/hooks/write-compact-handoff.mjs`, `reinject-compact-handoff.mjs` | Carry a work summary across a compaction through `tmp/` (gitignored) |
| `.claude/hooks/statusline.mjs`, `subagent-statusline.mjs`, `statusline-layout.mjs` | The status line and the per-subagent row |
| `.claude/agents/Explore.md`, `code-reviewer.md`, `silent-failure-hunter.md` | Read-only search, diff review and error-handling audit, written against the invariants above |
| `.claude/rules/tests.md`, `.claude/rules/refactoring.md` | Load when editing `tests/**` and `scripts/**`, `evals/**` |
| `.claude/skills/writing-commits/`, `creating-prs/`, `starting-work/`, `finishing-work/`, `triaging-ci/` | The commit, PR, branch, close-out and CI-failure workflows, written for the rules below |
| `.claude/skills/reviewing-dependabot-prs/`, `triaging-scan-alerts/`, `watching-pr-checks/` | `gh`-driven GitHub workflows. All ask before they act |
| `.claude/skills/harness-guidance/` | Checks this harness against Anthropic's current guidance. Its tracker is `.claude/research/harness-refresh.md` |
| `.claude/skills/customize/` | The m3l-groundwork bootstrapper's own copy, used once to tailor this harness. **Local only and gitignored**: it ships TypeScript files, and every tracked file ships to plugin users. Re-create it with `npx @monte3l/groundwork .` |

### If a guard breaks

Every PreToolUse guard fails closed (`onFailure: "block"`): a hook that cannot start, times
out or exits unexpectedly blocks the call. So a hook with a missing import, or a
`settings.json` that names a file that is not there, blocks every Bash, Write and Edit call,
the commands that would fix it included. That has happened once. To recover, run the fix
as a `!` command in the prompt, which runs without the hooks, for example
`! git checkout -- .claude` or `! rm .claude/settings.json` for a settings file that was
never committed. To avoid it, run `node --test ".claude/tests/*.test.mjs"` before trusting
a change to a hook or to settings; they would have caught it.

Git workflow, enforced by the hooks above and by the `main` ruleset:

- **Every change goes through a PR**, from a `feat/`, `fix/`, `ci/`, `chore/` or `docs/`
  branch. `main` rejects direct pushes, needs a code-owner approval from someone other
  than the author, and is merged with a merge commit, never squashed.
- **Commit with `git commit -s`** (the `dco` lane of `verify.yml` needs a `Signed-off-by`)
  and with a signature (the ruleset rejects unsigned commits). Conventional Commits, a
  lowercase imperative subject, a prose body.
- **Never force-push, never add a dependency, never hand-edit `design/source/`.**
- **Never write CommonJS, a secret or an `.env` file**; the hooks refuse them, from the
  Write and Edit tools and from Bash.
- **The guards are a safety net, not a sandbox.** The read-only guard covers only the three
  agents above; the main session, `general-purpose` and plugin agents are not checked.
  Claude Code's own sandbox is the OS-level control for shell commands
  (https://code.claude.com/docs/en/sandboxing); it is not enabled here.

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
- `tests/doc-parity.test.mjs`, `scripts/doc-parity.mjs`, `docs.config.mjs`,
  `design/source` and `plugin-evals/` are left out of the P4 fixture
  (`EXCLUDED` in `evals/p4.mjs`), so a docs-site file or a plugin-eval case
  never changes what a live run sees.
- Bold, never italics or underlines; a GitHub alert matched to severity, at most
  two in a row, `[!CAUTION]` only for data loss or anything irreversible; plain
  direct sentences; tables for tabular data.
- When behaviour changes, update the README tables and, if a host behaviour is
  newly confirmed or open, `UNVERIFIED.md`.
- Run git, package and verify commands from inside this repository, never from the
  workspace root.
