---
name: measure
description: Report where this project's Claude Code tokens went, from its own session transcripts (the share of output that is thinking, how much of billed input large Bash results carry, and which lever the numbers support). Use when the user types /m3l-output-governor:measure or asks where their output-token spend goes.
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/measure.mjs" *)
---

# Measure output tokens

The numbers below were computed just now from this project's session transcripts by `scripts/measure.mjs`. They are counts only: no prompt text, tool output or file paths.

```!
node "${CLAUDE_PLUGIN_ROOT}/scripts/measure.mjs" --project
```

If `sessions` is 0, say that no transcripts were found for this directory and stop. If instead the command above was replaced by a note that it did not run, such as `[shell command execution disabled by policy]`, say that the command did not run and give that reason, then stop. Do not report numbers, and do not say transcripts are missing when the command itself did not run. `subagentFiles` is how many of the counted transcripts belong to subagents.

Otherwise report, in this order, labelling each number **exact** (the `exact` block, from API usage) or **estimated** (the `estimated` block, derived from characters):

1. **Output and thinking.** Output tokens, and `thinkingShareOfOutput`. Thinking is billed as output, and effort level is the documented lever for it (Claude Code docs, `costs`).
2. **Large Bash results.** `bashOverGate` results of `gateChars` characters or more, and `bashOverGateShareOfBilledInput`. Below 0.10, shrinking tool results is not worth building; this project measured about 0.02 on its author's sessions. The estimate ignores compaction, so it overstates.
3. **Which lever the numbers support**, in one or two sentences, chosen from the "Levers" table in `${CLAUDE_PLUGIN_ROOT}/README.md`: effort when the thinking share is large, the built-in Concise style when answers are long (`exact.textAndToolUse` is large next to `exact.output`), `bashOutputMaxChars` only when the Bash share clears 0.10.

Then state the limits plainly: transcripts of this project only, and the re-read figure is a model, not a measurement.

Do not change any setting, and do not print or quote transcript content.
