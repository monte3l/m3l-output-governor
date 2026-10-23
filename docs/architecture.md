# Architecture

This page shows the actors and actions in the system and every external
interface the released plugin has. The file-by-file map is in
[`.claude/CLAUDE.md`](../.claude/CLAUDE.md#architecture). The threat analysis is
in the [assurance case](assurance-case.md).

## Actors and actions

| Actor | What it does here |
| --- | --- |
| **User** | Installs the plugin from the `monte3l/m3l-plugins` catalog, invokes `/m3l-output-governor:measure`, or runs `scripts/measure.mjs` by hand |
| **Claude Code** | Loads the plugin's one skill, substitutes `${CLAUDE_PLUGIN_ROOT}`, runs the skill's injected shell command if `allowed-tools` permits it, and writes the session transcripts the script reads |
| **`scripts/measure.mjs`** | Reads transcript files, sums token usage, prints counts. Makes no network call and writes nothing |
| **The `measure` skill** | Injects the script's output into the prompt. Claude then reports the numbers and the lever each one supports. It is user-invoked only |
| **Maintainer** | Runs `evals/p4.mjs --live` by hand, which spawns `claude -p` sessions and spends money on the credential `claude` resolves |
| **Contributor** | Opens issues. Pull requests are limited to collaborators |
| **CI (GitHub Actions)** | Runs the tests, coverage gate, style check, docs gate, plugin validation, scanners and the weekly Scorecard. Holds read-only tokens and no secrets, except the jobs named in [`SECURITY.md`](../SECURITY.md#secrets-and-credentials) |
| **Release workflow** | Opens a release pull request, and on merge tags the commit, builds a source tarball, attests it and publishes the release. It also tells the `m3l-plugins` catalog |

## Data flow

```text
Claude Code session -writes-> ~/.claude/projects/<project>/*.jsonl
                                          |
                                          | read-only
                                          v
user -/m3l-output-governor:measure-> measure.mjs -counts only-> Claude -> report
```

Nothing leaves the machine. The output is counts and tool names, never prompt
text, tool output or paths.

## External interfaces

**Interface 1: `scripts/measure.mjs` command line.** This is the public
contract.

| Part | Contract |
| --- | --- |
| Arguments | Transcript files or project directories. A directory also stands for each session's `subagents/*.jsonl` |
| `--project` | The current directory's transcript folder, under `~/.claude/projects` or `$CLAUDE_CONFIG_DIR/projects` |
| `--gate <chars>` | Positive number, default 8000 |
| Exit codes | 0 on success, 2 for an unknown flag or when no path was readable. An unreadable path is skipped and counted on stderr |
| Output | JSON counts. The field list is in the [README](../README.md#measure-from-the-command-line) and checked by `scripts/doc-parity.mjs` |

**Interface 2: the transcript files it reads.** Claude Code owns this format, so
it is an input, not a promise made by this project. The script reads one JSON
object per line and uses these fields only:

| Field | Used for |
| --- | --- |
| `type` (`assistant` or `user`) | Choosing which rows count |
| `message.id`, falling back to `uuid` | Counting an assistant message once |
| `message.usage` (input, cache read, cache creation and output tokens, and `output_tokens_details.thinking_tokens`) | The exact totals |
| `message.content[]` blocks of type `tool_use` (`id`, `name`) and `tool_result` (`tool_use_id`, text length) | Tool names and result sizes |

A malformed line is skipped. Text content is measured for its length and never
stored or printed.

**Interface 3: the skill.** `skills/measure/SKILL.md` is invoked as
`/m3l-output-governor:measure`. It has `disable-model-invocation: true`, and its
`allowed-tools` pre-approves only
`node "${CLAUDE_PLUGIN_ROOT}/scripts/measure.mjs" *`.

**Interface 4: `evals/p4.mjs`.** This is a recorded experiment and not part of
the contract. It runs `claude -p` with `--allowedTools`, `--max-budget-usd 1`
and a per-run timeout, in a scratch copy of the repository. Without `--live` it
is a dry run. Exit code 3 means it stopped at the first error row.

**Interface 5: distribution.** The plugin is installed from the
`monte3l/m3l-plugins` catalog, which pins a release tag and commit over HTTPS.
The docs site at `output-governor.monte3l.com` is static HTML deployed to
Cloudflare Workers Static Assets.
