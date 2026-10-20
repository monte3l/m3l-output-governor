<!-- harness-refresh: last-verified=2026-10-20 claude-code-version=2.1.304 -->

# Harness refresh tracker

First sweep, 2026-10-20, run by `/customize` through `harness-guidance` refresh mode. Every
claim below was `NEW`: no earlier tracker existed. Sources are Anthropic domains only.

**Coverage note: changelog read back to 2.1.295 (partial).** The Claude Code CHANGELOG is
about 1,056,000 characters and only the first 100,000 were read, so nothing older than 2.1.295
is covered. Versions 2.1.297 and 2.1.298 do not appear on the page. Local Claude Code is 2.1.304;
CI pins 2.1.303 in `.github/ci-tools/`.

**Scope:** `.claude/` (settings, hooks, agents, rules, skills except `customize`,
`.claude/CLAUDE.md`) and the plugin's shipped `.claude-plugin/` and `skills/measure/`.

## models-tiering

| Claim | Position now | Source |
| --- | --- | --- |
| Subagent `model` accepts an alias, a full id, or `inherit`; full ids are pinned snapshots | Valid. `claude-opus-5-5` and `claude-haiku-5-5` in the three agents are valid | code.claude.com/docs/en/sub-agents |
| Subagent `effort` is honoured and overrides the session level, but not `CLAUDE_CODE_EFFORT_LEVEL` | The docs do not say what an omitted subagent `effort` uses, so `Explore.md` (no `effort`) is unconfirmed | code.claude.com/docs/en/model-config |
| Defaults: Opus 5.5 `medium`, Haiku 5.5 `medium`, Fable 5.1 `high` | Sonnet 5.5 conflicts across official pages (`medium` vs `high`). `effort: medium` on the reviewers equals the default | platform.claude.com/docs/en/build-with-claude/effort |
| Haiku 5.5 suits subagent search; at `low` it is more likely to skip a search or check | Keep `Explore` at `medium`. Do not add `effort: low` | platform.claude.com/docs/en/about-claude/models/choosing-a-model |
| `claude-opus-5-5` retires no sooner than 2027-09-22; `claude-haiku-5-5` no sooner than 2027-10-07 | Active, no deprecation notice | platform.claude.com/docs/en/about-claude/model-deprecations |
| 2.1.296 fixed token counts for Haiku 5.5 | Transcripts from older CLIs may under-report Haiku usage. No repo file quotes Haiku counts | raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md |

## cc-features-settings

| Claim | Position now | Source |
| --- | --- | --- |
| An installed plugin loads a `.claude/` folder at its root | **No official source says so.** The documented layout lists only root directories (`skills/`, `agents/`, `hooks/hooks.json`, and so on). Treat `.claude/` as repo-only harness. Probed 2026-10-20 (UNVERIFIED.md closed row 21): an inline `--plugin-dir` load registered 0 hooks and read nothing under `.claude/`. Repeat on the installed copy via the catalog smoke-install | code.claude.com/docs/en/plugins-reference |
| `claude plugin validate` checks a `CLAUDE.md` at the plugin root | Consistent with keeping the project file at `.claude/CLAUDE.md` | code.claude.com/docs/en/plugins/cli-reference |
| A committed project-scope `enabledPlugins: true` does not install the plugin; the `/plugin` Errors tab reports it | Each of the 8 entries needs `claude plugin install <id> --scope project` | code.claude.com/docs/en/plugins/loading |
| `onFailure: "block"` on command hooks needs Claude Code 2.1.295 or later | Used on two guards. No minimum version is declared in the repo | code.claude.com/docs/en/hooks |
| 33 hook events exist | `settings.json` registers 4: `UserPromptSubmit`, `PreCompact`, `SessionStart`, `PreToolUse`. No `PostToolUse`, `Stop`, `SubagentStop` or `SessionEnd` | code.claude.com/docs/en/hooks |
| `plugin.json` requires only `name`; a pinned `version` keeps users on it until it changes | `1.0.0` is the first release; bump it on each release | code.claude.com/docs/en/plugins-reference |
| `marketplace.json` requires `name`, `owner`, `plugins`; the marketplace-root source is documented | This repo no longer ships a `marketplace.json`; the plugin is listed in the `monte3l/m3l-plugins` catalog | code.claude.com/docs/en/plugin-marketplaces |
| `claude -p` runs a project's committed hooks without a trust prompt; `--bare` skips hooks, plugins and `CLAUDE.md` | `verify.yml` has no `claude -p` step. Use `--bare` if one is added | code.claude.com/docs/en/headless |
| Settings `$schema` | Documented: the settings page shows `"$schema": "https://json.schemastore.org/claude-code-settings.json"` as the published JSON schema, which is exactly this repo's value | code.claude.com/docs/en/settings |

## agent-subagent-design

| Claim | Position now | Source |
| --- | --- | --- |
| Hook payloads carry `agent_id` and `agent_type` for a subagent's tool calls | `guard-readonly-bash.mjs` reads `agent_type` as documented. A `claude --agent <name>` main session also has `agent_type` set | code.claude.com/docs/en/hooks |
| A project agent named like a built-in overrides it | `.claude/agents/Explore.md` shadows the built-in `Explore` for this project | code.claude.com/docs/en/sub-agents |
| Read-only is strongest as a `tools` allowlist; `disallowedTools` only removes tools | All three agents keep `Bash`, so the Bash guard is the only backstop and it is a denylist | code.claude.com/docs/en/sub-agents |
| Fork subagents are on by default from 2.1.302; turn off with `Agent(fork)` in `permissions.deny` or `CLAUDE_CODE_FORK_SUBAGENT=0` | Only a fork inherits the conversation; a named agent such as `code-reviewer` starts fresh, so the reviewers stay independent. `evals/p4.mjs` uses `claude -p`, where forks are now on | code.claude.com/docs/en/sub-agents |
| Subagents nest to 3 layers by default; `disallowedTools: Agent` stops it | All three agents set it | code.claude.com/docs/en/sub-agents |
| Frontmatter fields (`name`, `description`, `tools`, `disallowedTools`, `model`, `effort`, `maxTurns`, `color`, and others) | All keys used are valid. Unknown keys are ignored silently | code.claude.com/docs/en/sub-agents |

## skills-context-engineering

| Claim | Position now | Source |
| --- | --- | --- |
| Skill listing truncates `description` plus `when_to_use` at 1,536 characters | Longest here: `harness-guidance` at 696. None over | code.claude.com/docs/en/skills |
| `disable-model-invocation: true` removes the skill from the model's context and blocks model invocation | `skills/measure` is correctly user-only | code.claude.com/docs/en/skills |
| A `!` injection that exits non-zero aborts the whole skill invocation | **Not observed.** Live probe 2026-10-20 (`claude -p`, 2.1.304, empty folder, `measure.mjs` exit 2): the skill did not abort, Claude saw `sessions: 0` and gave the intended "No transcripts were found" answer in 1 turn for $0.023. Headless only; the docs and the observed behaviour disagree | code.claude.com/docs/en/skills |
| `paths:` in a rule takes a glob list and loads the rule when a matching file is read or edited | Both rules valid. A test file loads both, which duplicates a few lines | code.claude.com/docs/en/memory |
| `./CLAUDE.md` and `./.claude/CLAUDE.md` are both loaded; target under 200 lines | `.claude/CLAUDE.md` is 154 lines | code.claude.com/docs/en/memory |
| `@` imports expand at launch and skip code spans | The two `@` mentions are inside backticks and stay literal | code.claude.com/docs/en/memory |

## hooks-lifecycle

| Claim | Position now | Source |
| --- | --- | --- |
| A matcher with other characters than letters, digits, `_`, `-`, space and comma is an unanchored regex | `Write\|Edit` is a regex, so it also matches `NotebookEdit`. The SDK page calls the same syntax an exact list: unresolved | code.claude.com/docs/en/hooks |
| `NotebookEdit` input uses `notebook_path` and `new_source`, not `file_path` and `content` | The three Write/Edit guards read only `file_path` or `content`, so a notebook edit passes all three. The repo has no notebooks | code.claude.com/docs/en/agent-sdk/hooks |
| PreToolUse: exit 2 blocks; any other non-zero exit, a failed start or bad JSON does not block, unless `onFailure: "block"` | Only `guard-branch-isolation` and `guard-secret-writes` fail closed. The other four Bash/Write guards fail open on a crash | code.claude.com/docs/en/hooks |
| `UserPromptSubmit` `additionalContext` shape; runs before a skill expands (2.1.299) | `inject-decision-gate.mjs` emits the documented shape | code.claude.com/docs/en/hooks |
| `SessionStart` matchers are `startup`, `resume`, `clear`, `compact`, `fork` | `compact\|resume\|startup` skips `clear` and `fork`, so the handoff is not reinjected after either | code.claude.com/docs/en/hooks |
| `PreCompact` matchers are `manual` and `auto`; exit 2 blocks compaction | No matcher, so both fire. The handoff hook always exits 0 | code.claude.com/docs/en/hooks |
| `timeout` is in seconds; default 600; matching hooks run in parallel; deny beats allow | Every command sets 30 | code.claude.com/docs/en/hooks |
| Bash-issued writes (`sed -i`, `tee`, redirects) never reach `Write\|Edit` guards | `guard-secret-writes` and `guard-branch-isolation` do not cover shell writes. This is the denylist's known limit | code.claude.com/docs/en/agent-sdk/hooks |
| `$CLAUDE_PROJECT_DIR` is the project root where the session started | A comment in `write-compact-handoff.mjs` says it is "pinned to the original checkout" in a worktree. The docs do not say that | code.claude.com/docs/en/hooks |

## Outstanding drift

| # | Finding | Impact | Status |
| --- | --- | --- | --- |
| 1 | `Write\|Edit` guards miss `NotebookEdit` | Low: no notebooks in the repo | **Applied 2026-10-20.** Matcher is now `^(Write\|Edit\|NotebookEdit)$`; `guard-branch-isolation` and `guard-secret-writes` read `notebook_path` and `new_source` |
| 2 | Four guards fail open on a hook crash | Low in practice, but a crash allowed the action | **Closed 2026-10-20.** All seven PreToolUse guards now fail closed (`onFailure: "block"`). The lockout seen once during adoption came from a missing file, not a bad payload, so the guards were also hardened (none crashes on 13 malformed payloads) and `.claude/tests/settings.test.mjs` checks that every registered hook exists and imports. CI runs it. Recovery steps are in `.claude/CLAUDE.md` |
| 3 | `SessionStart` reinjection skips `clear` and `fork` | Low | **Closed 2026-10-20 by decision, no change.** `compact|resume|startup` is deliberate: `/clear` means a fresh start and a fork already carries the conversation, so reinjecting a handoff there would be wrong |
| 4 | Fork subagents on by default | None: named agents start fresh, so reviewer independence holds | **Closed 2026-10-20.** The original finding overstated the risk. `Agent(fork)` in `permissions.deny` stays available if a review ever echoes the author |
| 5 | `skills/measure/SKILL.md` error branch may be unreachable after a non-zero exit | Shipped component | **Closed 2026-10-20, corrected the same day.** An earlier note said the skill does not abort on exit 2. It does: a probe plugin's injected command aborted the skill at 0 turns on exit 1 and 2 (UNVERIFIED.md Closed 20). The error branch ("or the command printed an error") was therefore unreachable, and the skill now covers the one failure Claude can see, a command replaced by a policy note. Headless only |
| 6 | Bash-issued writes bypass the Write/Edit guards | Medium: `echo KEY=v > .env`, `cat .env` and `sed -i ... scripts/x.mjs` on `main` passed both guards | **Closed 2026-10-20.** `.claude/hooks/guard-bash-writes.mjs` is the Bash side of both: it refuses a command that names or writes a secrets path (also through a glob or `HEAD:.env`) or carries a secret literal, and, on `main`, a command that is not read-only and names a guarded directory. Tested against real temporary repositories. It cannot see a command that writes into a guarded directory without naming it |
| 7 | `guard-branch-isolation` matched guarded directories case-sensitively, so `Scripts/x.mjs` passed on a case-insensitive filesystem | Medium: a re-cased path skipped the branch guard on `main`. The upstream baseline has the same flaw | **Fixed 2026-10-20** (found by the security-guidance post-commit review). Both patterns in `.claude/hooks/lib/protected-paths.mjs` are now case-insensitive; tested on a `main` clone |
| 8 | `subagent-statusline.mjs` did not strip control characters from the agent name or effort | Medium: an escape sequence in an agent name could repaint the terminal | **Fixed 2026-10-20.** Both go through `sanitizeDisplayText` from `statusline.mjs` |
| 9 | `env -S 'rm -rf x'` (and `-S'...'`, `--split-string`) slipped past the read-only Bash guard | Medium: a read-only agent could run any command through `env -S` | **Closed 2026-10-20 by replacing the denylist.** Three review rounds each found another way past it, so the guard is now an allowlist: `env`, `sudo`, `xargs` and every other wrapper are simply not on the list. See row 11 |
| 10 | The read-only guard allows git flags that run or write: `--upload-pack`, `--receive-pack`, `--ext-diff`, `--output`, `--open-files-in-pager`/`-O`, `--extcmd` | Medium | **Closed 2026-10-20.** `git` is allowlisted by subcommand, its exec and output options are refused including every unique prefix (`--ext`, `--out`), and so are `-c`, `-C`, `--exec-path` and `ext::` transports. See row 11 |
| 11 | The read-only Bash guard was a denylist: 101 of 140 probe commands that must block were allowed (`$(...)`, `node -e`, `timeout 5 rm`, `curl`, `sudo -u root`, `xargs -n 1 rm`, `awk`, `sed -n 'w f'`, `find -exec`, `sort -o`) | High | **Closed 2026-10-20.** Rewritten as an allowlist (about 950 lines down from 1,550): a command passes only if it expands nothing, redirects only to a discard target, assigns no variable, names no secrets path, runs no program by path, and runs a verb on a short read-only list with flags that pass that verb's rule. 0 of 140 probes pass. Over 500 regression tests, mutation-tested with no survivor |
| 12 | The guard covers only the agents defined in `.claude/agents/`: the main session, `general-purpose` and plugin agents (`plugin-dev:*`, `claude-security:*`) are not checked | By design: the main session and general-purpose agents must write, and `claude-security:patch-generator` must run builds | **Accepted and now stated plainly** in the guard's header and in `.claude/CLAUDE.md`. To hold another agent to the rule, give it an entry in `.claude/agents/` with the same name or narrow its `tools` |
| 13 | A fourth review round on the allowlist: brace expansion hid flags (`git diff --ext{,}-diff`); a secrets path sat behind a glued redirect, a glued flag or a glob (`cat <.env`, `grep -f.env`, `cat .e*`); node flags were a denylist; `printf -v`, `test -v` and `[[ -v a[x] ]]` assign or evaluate | High and medium | **Closed 2026-10-20.** Brace expansion is refused. Globs are expanded against the filesystem the way bash does (verified against `fs.globSync`), and a match on a secrets path, or on a name starting with `-` (which the command would read as an option), is refused. Glued redirects and flags are stripped before the path check. node flags are an allowlist. `printf -v`, `test -v`, a `[` subscript and `cd` outside the repository are refused, and so is `git` after a `cd` |
| 14 | The Bash-write guard blocked its own author: a heredoc body was parsed as commands, so a commit message that said "secrets" read as a command naming a secrets path | Medium (usability), found by using it | **Closed 2026-10-20.** A heredoc body is data and is stripped. The strip errs towards stripping less: a `<<` inside quotes, inside `((`, as `<<<` or before a non-word delimiter hides nothing, and an unquoted body is still checked for expansion |
| 15 | Two comments said `permissions.deny` Read rules cover the Read tool only, not Bash | Low: a false claim about Claude Code | **Corrected 2026-10-20** from `code.claude.com/docs/en/permissions`: the rules also cover file commands Claude Code recognises in Bash (`cat`, `head`, `tail`, `sed`, `tee`) and redirection targets, but not a command that reads without naming the file (`grep -r x .`) or an arbitrary subprocess |
| 16 | Settings `$schema` | None | **Closed 2026-10-20.** An earlier note called it a third-party risk and was wrong: `code.claude.com/docs/en/settings` shows this exact line and calls it the published JSON schema |
| 18 | Fifth review round: the Bash-write guard did not look inside `$(...)`, `sh -c` strings, interpreter code or shell heredocs, and a glob after a `cd` expanded in the wrong directory (16 of 26 probe cases passed) | High | **Closed 2026-10-20.** One `expandCommand` in the read-only module feeds both guards: it follows `cd`, expands globs for real (`**` included, `node_modules` and `.git` skipped), and a heredoc is code only when a shell or interpreter shares the line with its marker. After a `cd` it cannot follow, a glob is refused only if its pattern could match a secret name. The read-only guard refuses any heredoc and any unquoted `{` that opens no group. Mutation-tested: 7 of 8 mutants killed; the survivor (`nested: true` on a heredoc entry) is equivalent, since no code verb is mention-only |
| 17 | Claude Code's sandbox is the OS-level control for Bash filesystem and network access; every hook here is a check on command text | Defense in depth | **Open, a decision for the owner.** Not enabled: it changes how every command runs (commit signing through gpg-agent, `gh`, the docs build) and needs testing against those workflows. See `code.claude.com/docs/en/sandboxing` |

## Coverage gaps

- Changelog older than 2.1.295.
- Closed 2026-10-20 from the official pages: `statusLine` `padding` (extra horizontal spacing in characters, default 0) and `refreshInterval` (re-runs the command every N seconds, minimum 1) are valid as set (`code.claude.com/docs/en/statusline`), and `Read(./.env)` is the documented form for the `.env` in the current directory (`code.claude.com/docs/en/permissions`). Still not read: how `**` and a trailing `.*` behave inside a `Read(...)` deny rule.
- The `Write|Edit` matcher is regex on the hooks page and an exact list on the SDK page.
- Official guidance on web tools held by a read-only agent, on a reviewer-versus-explorer model tier, and on an omitted subagent `effort`.
- Total skill-listing budget and its defaults (`skillListingBudgetFraction`, `skillListingMaxDescChars`).
- `Stop` and `SubagentStop` input, and whether hooks may write files under the project.
- Not allowlisted, so not cited: `claude.dev`, `academy.claude.com`, `support.claude.com`, `resources.anthropic.com`, third-party GitHub repositories.
