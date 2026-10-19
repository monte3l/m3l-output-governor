# m3l-output-governor

Measures where Claude Code's output tokens go, so the levers that lower them
can be chosen from your own sessions instead of guessed. It never changes what
Claude sees, says or does.

> [!NOTE]
> An earlier design also shrank tool results with a hook. A baseline over 359
> real sessions showed Bash results of 8,000 characters or more carry about 2% of
> billed input, so that layer was dropped. That baseline read each session's
> main transcript and left out subagent transcripts. The numbers are in
> [`UNVERIFIED.md`](UNVERIFIED.md).

## Install

```
/plugin install m3l-output-governor --marketplace monte3l/m3l-output-governor
```

To try it from a checkout without installing, run
`claude --plugin-dir /path/to/m3l-output-governor`. The plugin ships one
skill and no hooks, so it changes nothing about how Claude Code runs.

## Use

Type `/m3l-output-governor:measure` in a project. The skill runs
`scripts/measure.mjs --project` on that project's own session transcripts and
Claude reports the numbers below with the lever they support. It only reads
transcripts, prints counts and never changes a setting. It is user-invoked
only, because it reads your session history.

## Measure

```zsh
node scripts/measure.mjs ~/.claude/projects/<project>/*.jsonl
node scripts/measure.mjs --gate 4000 ~/.claude/projects/*/*.jsonl
node scripts/measure.mjs --project           # this directory's transcripts
```

| Argument | Meaning |
| --- | --- |
| `<file or directory>…` | A transcript file, or a project directory. A directory stands for its `.jsonl` files plus each session's `<session>/subagents/*.jsonl` |
| `--project` | This project's transcript folder under `~/.claude/projects`, from the exact current directory (not the git root, so run it from the project root) |
| `--gate <chars>` | Separate value, default 8000. `--gate=4000` is not accepted. Must be a positive number |

The script reads local session transcripts and prints counts and tool names
only. It never prints prompt text, tool output or paths. An unknown flag prints
the usage line and exits 2. A path it cannot read is skipped with a count on
stderr (`skipped: 1 unreadable path(s)`), and it exits 2 if none could be read.

| Field | Source | Exact or estimated |
| --- | --- | --- |
| `sessions`, `subagentFiles`, `requests` | Readable transcript files, how many of them are subagent transcripts, and de-duplicated assistant messages with usage. An empty file counts as a session | Exact |
| `exact.input`, `cacheRead`, `cacheCreate`, `output` | Transcript `usage` | Exact |
| `exact.thinking`, `thinkingShareOfOutput` | `usage.output_tokens_details.thinking_tokens` | Exact |
| `exact.textAndToolUse` | Output minus thinking | Exact |
| `estimated.gateChars` | The gate in use | Exact |
| `estimated.bashResults`, `bashMaxChars` | Count and largest size (characters) of Bash results | Estimated (text blocks only; other block types count as 0 characters) |
| `estimated.bashOverGate`, `bashOverGateTokens` | Bash results at or over the gate, and their size in tokens (characters divided by 4) | Estimated |
| `estimated.toolResultTokensByTool` | Result characters divided by 4, for the 8 largest tools only (text blocks only) | Estimated |
| `estimated.rereadTokens.allToolResults`, `.bash`, `.bashOverGate` | A result's size times the requests after it in the session. Compaction is ignored, so this overstates | Estimated |
| `estimated.bashOverGateShareOfBilledInput` | Re-read tokens of Bash results at or over the gate, divided by billed input (`input + cacheRead + cacheCreate`) | Estimated |

`thinkingShareOfOutput` and `bashOverGateShareOfBilledInput` are fractions from 0 to 1,
rounded to 3 decimals, not percentages.

## Levers

These are the official levers on the output side. Each claim is from the Claude
Code docs at code.claude.com.

| Lever | What it does | Source |
| --- | --- | --- |
| Effort level | Thinking is billed as output tokens, and on adaptive models effort is the control for it | `costs` |
| Concise output style | Leads with the result and drops lead-in, step-by-step narration and the closing recap. Needs Claude Code 2.1.237 or newer. Measured here on Opus 5.5 at `medium` over 24 paired runs: output tokens fell 17% in total with no loss of checked answers, 16 to 42% on explanations, reviews, plans, git questions and locating code (32%) and about 0% on fixes, a manifest lookup and one-line facts. Cost per run fell only 3%, because the fixed prompt prefix dominates | `output-styles`, `UNVERIFIED.md` |
| Subagents for verbose work | Keeps test and log output in the subagent's context and returns a summary. The subagent's own requests still draw on your usage | `sub-agents`, `costs` |
| `bashOutputMaxChars` setting | Sets how many characters of a successful Bash command's output Claude receives inline (default 30,000, clamped to 4,000 to 128,000, v2.1.261 or newer). Past the limit Claude gets a file path and a short preview. A built-in way to cap large results with no hook | `settings-reference` |
| Hook preprocessing of tool data | Returns only matching lines of a large log. A hook's replacement is what is stored and re-read (checked in `UNVERIFIED.md`). Worth it only when large results are a real share of your input; measure first | `costs`, `hooks` |

Check your own share of thinking in output with `measure.mjs` before changing
effort: on the author's sessions it was 36%.

## Development

```zsh
node --test "tests/*.test.mjs"                    # unit tests
claude plugin validate --strict .                 # manifest (CI uses the version pinned in .github/ci-tools)
node evals/summarize.mjs evals/p4-2026-10-19.jsonl   # reproduce the P4 table, free
node evals/p4.mjs                                 # dry run: prints the plan and a cost estimate
node evals/p4.mjs --live                          # spends about $5 on the credential claude resolves
```

The live eval compares built-in Concise with the default style on Opus 5.5.
Results and limits are in [`evals/results.md`](evals/results.md).

| `evals/p4.mjs` flag | Default | Meaning |
| --- | --- | --- |
| `--live` | off | Spawn `claude -p` sessions. Without it, a dry run prints the plan and a cost estimate (48 runs, about $4.80) |
| `--reps <n>` | 3 | Repetitions per task and arm |
| `--tasks <ids>` | all 8 | Comma-separated task id prefixes, for example `T8` |
| `--arms <list>` | `default,concise` | Any arm other than `concise` runs the default style, and `summarize.mjs` pairs only `default` with `concise` |
| `--max-spend <usd>` | 5 | A soft guard, checked before each run, so a run can take the total past it. Each run is also capped at `--max-budget-usd 1` and 240 seconds |
| `--out <file>` | `evals/.results/p4-<UTC date>.jsonl` | Result rows. A rerun resumes past valid rows in this file, so by default resuming works within one UTC day |

The runner stops at the first error row and exits 3. Each run also writes its
answer text to `evals/.results/texts/`, which is gitignored and is not part of
the committed data. Each row holds 19 count and flag fields (task, arm, rep,
order, seconds, model, style, cost, token counts, requests, turns, tool calls,
repeated calls, answer length, pass, error).

## Licence

MIT
