#!/usr/bin/env node
/**
 * UserPromptSubmit: when a prompt looks like change-work, inject a short
 * reminder about branch and PR hygiene as additional context, before the
 * agent starts editing.
 *
 * This is the only UserPromptSubmit hook in this project's harness and the
 * only one that *injects* context (every other hook communicates via stderr
 * + exit code). It surfaces the decisions the `starting-work` skill formalizes --
 * branch and PR target -- up front, so isolation is chosen deliberately
 * instead of being discovered when `guard-branch-isolation.mjs` blocks a
 * code write on `main`.
 *
 * It sees the line as typed: Claude Code runs `UserPromptSubmit` hooks before
 * a skill or slash command expands (2.1.299), so `/creating-prs fix the lint`
 * is judged on those words, and a bare `/starting-work` carries no change verb.
 *
 * It is advisory: it emits `additionalContext` and exits 0. It never blocks.
 * The heuristic is deliberately loose (inject on any change-intent verb,
 * stay quiet on obvious reads) -- a spurious reminder is cheap; a missed one
 * costs a mid-task branch scramble.
 */
import process from "node:process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// Verbs that signal the user is about to change the tree, not just ask about it.
const CHANGE_INTENT =
  /\b(implement|build|add|create|write|fix|refactor|scaffold|rename|migrate|wire up|delete|remove|update|change|edit|generate)\b/i;
// Strong read-only openers; if the prompt is one of these and carries no change
// verb, stay quiet.
const READ_ONLY_OPENER =
  /^\s*(what|why|how|when|where|which|who|explain|describe|show|list|read|find|search|look|review|audit|is|are|does|can|should|could)\b/i;

/** Current branch, or "" if git isn't available. "HEAD" means detached. */
function currentBranch() {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

/**
 * Heuristic: does this prompt look like it will change the tree (vs. a read)?
 *
 * @param {string} prompt
 * @returns {boolean}
 */
export function looksLikeChangeWork(prompt) {
  if (typeof prompt !== "string" || prompt.trim().length === 0) return false;
  if (!CHANGE_INTENT.test(prompt)) return false;
  if (
    READ_ONLY_OPENER.test(prompt) &&
    !/^\s*\S+\s+(the|this|a|an)\b/i.test(prompt)
  )
    return false;
  return true;
}

/**
 * Build the decision-gate reminder text for the current branch.
 *
 * @param {string} branch  current branch ("main", "HEAD" for detached, "" for no repo)
 * @returns {string}
 */
export function buildContext(branch) {
  const onMain = branch === "main" || branch === "HEAD" || branch === "";
  const branchLine =
    branch === ""
      ? "not a git repo"
      : branch === "HEAD"
        ? "detached HEAD"
        : `on \`${branch}\``;
  return [
    "Decision gate (before editing code, tests or the skill) -- currently " +
      `${branchLine}. These decisions come first, ideally via the \`starting-work\` skill:`,
    "  • Branch -- a `feat/`, `fix/`, `ci/`, `chore/` or `docs/` branch off `main`, not `main` itself" +
      (onMain ? "; HEAD may be on/at `main` now" : "") +
      ".",
    "  • PR -- every change lands via a PR (the `main` ruleset rejects direct pushes), commits signed off with `git commit -s`.",
    "  • Push -- the target is `origin <branch>`, not `origin main`.",
    "guard-branch-isolation.mjs blocks writes to scripts/, evals/, tests/, skills/ and .claude-plugin/ while HEAD is on `main`.",
  ].join("\n");
}

// Kept as a duplicated, self-contained block in every hook file rather than
// imported from a shared helper, so this check has no import that could fail.
// `import.meta.url` is symlink-resolved but
// `process.argv[1]` is not, so comparing them directly would be false under
// a symlinked invocation path -- and the guard below would then never run,
// i.e. silently fail open (exit 0) instead of blocking.
function isEntryPoint() {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

// Only run when invoked directly, not when imported for testing.
if (isEntryPoint()) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    process.exit(0);
  }
  // A payload that is not an object names nothing to judge; do not crash on it.
  if (typeof input !== "object" || input === null) process.exit(0);

  if (!looksLikeChangeWork(input.prompt ?? "")) process.exit(0);

  const output = {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: buildContext(currentBranch()),
    },
  };
  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}
