# m3l-output-governor

[![verify](https://github.com/monte3l/m3l-output-governor/actions/workflows/verify.yml/badge.svg?branch=main)](https://github.com/monte3l/m3l-output-governor/actions/workflows/verify.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/monte3l/m3l-output-governor/badge)](https://securityscorecards.dev/viewer/?uri=github.com/monte3l/m3l-output-governor)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/15707/badge)](https://www.bestpractices.dev/projects/15707)
[![REUSE status](https://api.reuse.software/badge/github.com/monte3l/m3l-output-governor)](https://api.reuse.software/info/github.com/monte3l/m3l-output-governor)

m3l-output-governor is a Claude Code plugin that measures where Claude Code's
output tokens go, so the levers that lower them can be chosen from your own
sessions instead of guessed. It never changes what Claude sees, says or does.

## Who is this for

- Someone who wants to **lower Claude Code's output-token cost** and would
  rather see their own numbers than follow a rule of thumb.
- Someone deciding whether to **change the effort level** and wants to know how
  much of their output is thinking first.
- Someone weighing the **built-in Concise output style** and wants the measured
  effect on a real task set, with its limits.

## Quickstart

You need [Claude Code](https://docs.claude.com/en/docs/claude-code/overview)
(see [Requirements](#requirements) for versions).

1. Install the plugin:

   ```
   /plugin install m3l-output-governor --marketplace monte3l/m3l-output-governor
   ```

2. In a project you have used with Claude Code, run
   `/m3l-output-governor:measure`. Claude reports the numbers for that project's
   own session transcripts.
3. Read `thinkingShareOfOutput` against [Levers](#levers) to see which one
   applies to you. On the author's sessions it was 36%.

To try it from a checkout without installing, run
`claude --plugin-dir /path/to/m3l-output-governor`.

## How it works

The plugin ships one skill and no hooks, so it changes nothing about how Claude
Code runs. The skill runs `scripts/measure.mjs --project` on the current
project's session transcripts, and Claude reports the numbers with the lever
they support. The script only reads transcripts and prints counts: never prompt
text, tool output or paths. The skill is user-invoked only, because it reads
your session history.

Every number is labelled **exact** (read straight from a transcript's `usage`
fields) or **estimated** (derived from characters, at 4 characters per token).
See [Measure from the command line](#measure-from-the-command-line) for the full
field list.

> [!NOTE]
> An earlier design also shrank tool results with a hook. A baseline over 359
> real sessions showed Bash results of 8,000 characters or more carry about 2% of
> billed input, so that layer was dropped. That baseline read each session's
> main transcript only; counting subagent transcripts too gives 2.4%. The numbers are in
> [`UNVERIFIED.md`](UNVERIFIED.md).

## Measure from the command line

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
| Concise output style | Leads with the result and drops lead-in, step-by-step narration and the closing recap. Needs Claude Code 2.1.237 or newer. Measured here on Opus 5.5 at `medium` over 24 paired runs: output tokens fell 17% in total with no loss of checked answers (two repeat runs on a corrected fixture gave 15% and 13%), 16 to 42% on explanations, reviews, plans, git questions and locating code (32%) and about 0% on fixes, a manifest lookup and one-line facts. Cost per run fell only 3%, because the fixed prompt prefix dominates | `output-styles`, `UNVERIFIED.md` |
| Subagents for verbose work | Keeps test and log output in the subagent's context and returns a summary. The subagent's own requests still draw on your usage | `sub-agents`, `costs` |
| `bashOutputMaxChars` setting | Sets how many characters of a successful Bash command's output Claude receives inline (default 30,000, clamped to 4,000 to 128,000, v2.1.261 or newer). Past the limit Claude gets a file path and a short preview. A built-in way to cap large results with no hook | `settings-reference` |
| Hook preprocessing of tool data | Returns only matching lines of a large log. A hook's replacement is what is stored and re-read (checked in `UNVERIFIED.md`). Worth it only when large results are a real share of your input; measure first | `costs`, `hooks` |

Check your own share of thinking in output with `measure.mjs` before changing
effort.

## Requirements

- **Claude Code**, with version 2.1.237 or newer for the Concise output style
  and 2.1.261 or newer for `bashOutputMaxChars`.
- **Node 24 or newer**, to run `scripts/measure.mjs` and the evals outside the
  skill. `.node-version` is the authority. The plugin has no `package.json` and
  no runtime dependency.

## Working on this repo

```zsh
node --test "tests/*.test.mjs"                    # unit tests
claude plugin validate --strict .                 # manifest (CI uses the version pinned in .github/ci-tools)
node design/source/docs-kit/build.mjs --check     # docs site gate: links, page coverage, design checksums, doc-versus-code parity
node design/source/docs-kit/build.mjs --out _site # build the docs site locally
node scripts/doc-parity.mjs                       # only the doc-versus-code parity checks
node evals/summarize.mjs evals/p4-2026-10-19.jsonl   # reproduce the P4 table, free (also the -run2 and -run3 files)
node evals/p4.mjs                                 # dry run: prints the plan and a cost estimate
node evals/p4.mjs --live                          # spends about $5 on the credential claude resolves
```

Commits are Conventional Commits, signed, with a `Signed-off-by` trailer
(`git commit -s`). The `DCO sign-off` check fails a pull request that has a
commit without one.

The live eval compares built-in Concise with the default style on Opus 5.5.
Results and limits are in [`evals/results.md`](evals/results.md). The numbers
quoted in this README and in `evals/results.md` are recomputed from the committed
runs by `scripts/doc-parity.mjs`, so a hand-copied figure that drifts fails the
docs check.

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

### Project docs

- [Documentation site](https://output-governor.monte3l.com) -- these pages,
  built from the repository's Markdown. A page is on it only if it is listed in
  `docs.config.mjs`.
- [`evals/results.md`](evals/results.md) -- the three recorded Concise-style
  runs and their limits.
- [`UNVERIFIED.md`](UNVERIFIED.md) -- what was confirmed by a live check, and
  what is still open.
- [`SECURITY.md`](SECURITY.md) -- reporting a vulnerability, the accepted CI
  install-script risk, and the accepted Scorecard findings.
- [`CHANGELOG.md`](CHANGELOG.md) -- what changed in each release.
- [`.claude/CLAUDE.md`](.claude/CLAUDE.md) -- the architecture and constraints,
  written for Claude Code agents.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) -- how to report a bug, commit and open a
  pull request. The code of conduct and support are the
  [organization defaults](https://github.com/monte3l/.github).

## License

[MIT](LICENSE).
