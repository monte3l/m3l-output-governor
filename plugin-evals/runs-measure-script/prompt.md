---
description: The plugin loads and the skill's injected command runs measure.mjs from CLAUDE_PLUGIN_ROOT under the skill's own allowed-tools. In the eval sandbox the transcripts folder is unreadable, so the script exits 2 and the skill aborts at 0 turns, which still shows the script ran
expected_outcome: The trace holds measure.mjs's zero report (sessions 0). Without the plugin the command does not exist, so the trace has no such report. A model never answers in this case
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

/m3l-output-governor:measure
