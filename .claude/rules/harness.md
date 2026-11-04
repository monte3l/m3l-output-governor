---
paths:
  - ".claude/**"
---

# Harness files (`.claude/**`)

> Loads when you read or edit anything under `.claude/`. `.claude/CLAUDE.md` keeps the overview and the recovery steps.

| Path | What it does |
| --- | --- |
| `.claude/settings.json` | Denies reading `.env*` and `secrets/**`, registers the hooks listed here (every PreToolUse guard fails closed, see "If a guard breaks" in `.claude/CLAUDE.md`), sets the status line, and enables the project plugins (each needs one `claude plugin install <id> --scope project`) |
| `.claude/hooks/guard-branch-isolation.mjs` | Blocks writes to `scripts/`, `evals/`, `tests/`, `skills/` and `.claude-plugin/` while HEAD is `main`. Its path set is `.claude/hooks/lib/protected-paths.mjs` |
| `.claude/hooks/guard-git-push-signed.mjs` | Blocks a `git push` that contains unsigned commits. Uses `.claude/hooks/lib/signed-range.mjs` |
| `.claude/hooks/guard-no-commonjs.mjs`, `guard-secret-writes.mjs`, `guard-double-background.mjs` | Block `require`/`module.exports`, writes of `.env*` or secret-shaped values, and a background command that also detaches itself |
| `.claude/hooks/guard-readonly-bash.mjs` | Holds the read-only agents to an **allowlist** of read-only commands: no `$` expansion, substitution, shell assignment, secrets path or write redirect, and only the verbs it names. It covers only the agents defined in `.claude/agents/` (the roster is `.claude/hooks/lib/agent-roster.mjs`, empty: no agent here writes). The main session, `general-purpose` and plugin agents are not checked |
| `.claude/hooks/guard-bash-writes.mjs` | The Bash side of the secret-write and branch guards, for every session: refuses a command that names or writes a secrets path (a dotenv file, a key, `~/.ssh`, also through a glob or `HEAD:.env`) or carries a secret literal, and, while HEAD is `main`, a command that is not read-only and names a guarded directory. It looks inside `$(...)`, backticks, `sh -c` strings and interpreter code, follows `cd`, and expands globs (`**` too). A heredoc body is data unless a shell or interpreter shares the line with its marker (`bash <<EOF`, `cat <<EOF | python3`), and then it is code. The read-only guard refuses any heredoc and any unquoted `{` that opens no group. It cannot see a command that writes into a guarded directory without naming it |
| `.claude/tests/guard-readonly-bash.test.mjs`, `guard-bash-writes.test.mjs`, `settings.test.mjs` | Regression tests for the two Bash guards, mutation-tested, and integrity tests for `.claude/settings.json`: every registered hook exists and imports, every PreToolUse guard fails closed, none crashes on a malformed payload, and each still blocks what it exists to block. Not under `tests/`, where the eval fixture would see a second failing test. The `checks` lane of `verify.yml` runs them; run `node --test ".claude/tests/*.test.mjs"` after any change to a hook or to `settings.json` |
| `.claude/hooks/inject-decision-gate.mjs` | Reminds about branch and PR before change work. Advisory, never blocks |
| `.claude/hooks/write-compact-handoff.mjs`, `reinject-compact-handoff.mjs` | Carry a work summary across a compaction through `tmp/` (gitignored) |
| `.claude/hooks/statusline.mjs`, `subagent-statusline.mjs`, `statusline-layout.mjs` | The status line and the per-subagent row |
| `.claude/agents/Explore.md`, `code-reviewer.md`, `silent-failure-hunter.md` | Read-only search, diff review and error-handling audit, written against the invariants in `.claude/CLAUDE.md` |
| `.claude/rules/tests.md`, `.claude/rules/refactoring.md` | Load when editing `tests/**` and `scripts/**`, `evals/**` |
| `.claude/rules/harness.md` | This file. Loads when anything under `.claude/` is read or edited |
| `.claude/skills/writing-commits/`, `creating-prs/`, `starting-work/`, `finishing-work/`, `triaging-ci/` | The commit, PR, branch, close-out and CI-failure workflows, written for the Git workflow rules in `.claude/CLAUDE.md` |
| `.claude/skills/reviewing-dependabot-prs/`, `triaging-scan-alerts/`, `watching-pr-checks/` | `gh`-driven GitHub workflows. All ask before they act |
| `.claude/skills/harness-guidance/` | Checks this harness against Anthropic's current guidance. Its tracker is `.claude/research/harness-refresh.md` |
| `.claude/skills/customize/` | The m3l-groundwork bootstrapper's own copy, used once to tailor this harness. **Local only and gitignored**: it ships TypeScript files, and every tracked file ships to plugin users. Re-create it with `npx @monte3l/groundwork .` |
