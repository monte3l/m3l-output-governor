#!/usr/bin/env node
/**
 * PreToolUse (Bash), every session: the Bash side of two Write/Edit guards.
 *
 * `guard-secret-writes.mjs` and `guard-branch-isolation.mjs` see only Write, Edit
 * and NotebookEdit. Without this hook `echo KEY=v > .env`, `cat .env` and
 * `sed -i s/a/b/ scripts/measure.mjs` on `main` would walk straight past both.
 * The `permissions.deny` Read rules reach the Read tool, the file commands Claude Code
 * recognises in Bash (`cat`, `head`, `tail`, `sed`, `tee`) and redirection targets, but
 * not a command that reads without naming the file (`grep -r x .`) or an arbitrary
 * subprocess (https://code.claude.com/docs/en/permissions, "Read and Edit deny rules").
 * This hook covers every verb, globs, and `REV:path` forms the deny rule does not.
 *
 * Two checks, each a hard block (exit 2):
 *
 *   1. Secrets. A command that names a secrets path (a dotenv file that is not a
 *      `.env.example` template, a key file, `~/.ssh` and the like, see
 *      `isSecretPath`), writes to one by redirection, reaches one through a glob
 *      that matches it, or carries a recognised secret literal. A command whose
 *      verb only prints or tests its arguments (`echo ".env" >> .gitignore`) is
 *      not a use of the file, so it is let through.
 *
 *   2. Branch. While HEAD is `main` (or detached on it), a command that is not
 *      read-only and names a guarded directory (`scripts/`, `evals/`, `tests/`,
 *      `skills/`, `.claude-plugin/`), or runs from inside one, is refused. "Not
 *      read-only" is the read-only allowlist's own verdict, so a command nobody
 *      thought of counts as a write: this side fails closed.
 *
 * What it cannot see: a command that writes into a guarded directory without
 * naming it or running from it (`node build.mjs` that writes to `scripts/`). The
 * `main` ruleset and CI are the backstops, as for every guard here.
 */
import process from "node:process";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findSecrets } from "./guard-secret-writes.mjs";
import {
  defaultGitFor,
  isMainOrDetachedOnMain,
} from "./guard-branch-isolation.mjs";
import {
  bashCommands,
  classifyBashCommand,
  redirectTargets,
  secretPathsNamed,
} from "./guard-readonly-bash.mjs";
import { canonicalize, isProtectedPath } from "./lib/protected-paths.mjs";

// Verbs that only print or test what they are given: naming `.env` to them is
// not reading or writing it.
const MENTION_ONLY = new Set([
  "echo", "printf", "test", "[", "[[", "ls", "stat", "basename", "dirname", "type", "which",
]);

const GUARDED_DIR = /^(?:scripts|evals|tests|skills|\.claude-plugin)$/i;

/**
 * Whether a word names something inside a guarded directory: any of its path
 * segments is one. Deliberately broad; it is only consulted for a write.
 *
 * @param {string} word
 * @returns {boolean}
 */
export function namesGuardedPath(word) {
  return word.split(/[/\\]/).some((part) => GUARDED_DIR.test(part));
}

/**
 * @param {string} command
 * @param {string} cwd
 * @returns {string | undefined} why the command touches a secret, else undefined
 */
export function secretsReason(command, cwd) {
  for (const { verb, path } of secretPathsNamed(command, cwd)) {
    if (!MENTION_ONLY.has(verb)) {
      return verb === "(redirect)"
        ? `redirects output to a secrets path (${path})`
        : `runs "${verb}" on a secrets path (${path})`;
    }
  }
  const [literal] = findSecrets(command);
  return literal === undefined ? undefined : `carries a secret: ${literal}`;
}

/**
 * @param {string} command
 * @param {string} cwd
 * @param {(args: string[]) => string} git runs git in `cwd`, "" on failure
 * @returns {string | undefined} why the command may not run on `main`, else undefined
 */
export function branchReason(command, cwd, git) {
  if (!classifyBashCommand(command, { cwd }).blocked) return undefined;
  const named = [
    ...bashCommands(command).flatMap((c) => c.tokens),
    ...redirectTargets(command),
  ].find(namesGuardedPath);
  const top = git(["rev-parse", "--show-toplevel"]);
  const inside =
    top !== "" && isProtectedPath(join(canonicalize(cwd), "x"), canonicalize(top));
  if (named === undefined && !inside) return undefined;
  if (!isMainOrDetachedOnMain(git)) return undefined;
  return named === undefined
    ? "is not read-only and runs from inside a guarded directory"
    : `is not read-only and names \`${named}\``;
}

// Deliberately inlined in every hook rather than shared, so each hook stays
// one self-contained file.
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

  const command = input.tool_input?.command;
  if (typeof command !== "string" || command.trim() === "") process.exit(0);
  const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();

  const secret = secretsReason(command, cwd);
  if (secret !== undefined) {
    process.stderr.write(
      `[guard-bash-writes] Blocked: this command ${secret}.\n\n` +
        `Secrets and credentials must not be read or written through the shell. ` +
        `Use a CI secret or an environment variable reference, and edit \`.env.example\` ` +
        `for a template.\n`,
    );
    process.exit(2);
  }

  const branch = branchReason(command, cwd, defaultGitFor(cwd));
  if (branch !== undefined) {
    process.stderr.write(
      `[guard-bash-writes] Blocked: this command ${branch} while HEAD is \`main\`.\n\n` +
        `Implementation work runs on an isolated branch. Run ` +
        `\`git switch -c feat/<slug>\` first, as its own command.\n`,
    );
    process.exit(2);
  }

  process.exit(0);
}
