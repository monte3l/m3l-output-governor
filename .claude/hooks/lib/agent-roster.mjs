/**
 * The writer-spoke roster: subagent names the read-only Bash guard treats as
 * allowed to mutate the repository. Empty on purpose. This repository keeps
 * no writer spoke (the baseline's `code-implementer` and `test-author` were
 * dropped), so every agent under `.claude/agents/` -- `Explore`,
 * `code-reviewer`, `silent-failure-hunter` -- counts as read-only and
 * `guard-readonly-bash.mjs` restricts its Bash calls to non-mutating commands.
 * Add a name here only together with the agent definition that needs to write.
 */
export const WRITER_SPOKES = new Set();
