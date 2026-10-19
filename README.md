# m3l-output-governor

Measures where Claude Code's output tokens go, so the levers that lower them
can be chosen from your own sessions instead of guessed. It never changes what
Claude sees, says or does.

> [!NOTE]
> An earlier design also shrank tool results with a hook. A baseline over 359
> real sessions showed Bash results over 8,000 characters carry about 2% of
> billed input, so that layer was dropped. The numbers are in
> [`UNVERIFIED.md`](UNVERIFIED.md).

## Measure

```zsh
node scripts/measure.mjs ~/.claude/projects/<project>/*.jsonl
node scripts/measure.mjs --gate 4000 ~/.claude/projects/*/*.jsonl
```

The script reads local session transcripts and prints counts only. It never
prints prompt text, tool output or paths.

| Field | Source | Exact or estimated |
| --- | --- | --- |
| `exact.input`, `cacheRead`, `cacheCreate`, `output` | Transcript `usage` | Exact |
| `exact.thinking`, `thinkingShareOfOutput` | `usage.output_tokens_details.thinking_tokens` | Exact |
| `exact.textAndToolUse` | Output minus thinking | Exact |
| `estimated.toolResultTokensByTool` | Result characters divided by 4 | Estimated |
| `estimated.rereadTokens` | A result's size times the requests after it in the session. Compaction is ignored, so this overstates | Estimated |
| `estimated.bashOverGateShareOfBilledInput` | Re-read tokens of Bash results at or over `--gate` characters, divided by all billed input | Estimated |

## Levers

These are the official levers on the output side. Each claim is from the Claude
Code docs at code.claude.com.

| Lever | What it does | Source |
| --- | --- | --- |
| Effort level | Thinking is billed as output tokens, and on adaptive models effort is the control for it | `costs` |
| Concise output style | Leads with the result and drops lead-in, step-by-step narration and the closing recap. Needs Claude Code 2.1.237 or newer. Measured here on Opus 5.5 at `medium` over 24 paired runs: output tokens fell 17% in total with no loss of checked answers, 16 to 42% on explanations, reviews, plans and git questions and about 0% on fixes and one-line facts. Cost per run fell only 3%, because the fixed prompt prefix dominates | `output-styles`, `UNVERIFIED.md` |
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

## Licence

MIT
