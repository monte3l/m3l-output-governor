#!/usr/bin/env node
/**
 * PreToolUse guard (Write|Edit): keeps implementation work off `main`.
 *
 * Every change to this repository lands through a PR (the `main` ruleset
 * rejects direct pushes), so work belongs on a feature branch or an isolated
 * worktree, never directly on `main`. This guard blocks writes to the
 * repository's code while `HEAD` is `main`.
 *
 * Scope (blocked while on `main`): a top-level `scripts/`, `evals/`, `tests/`,
 * `skills/` or `.claude-plugin/` path -- see .claude/hooks/lib/protected-paths.mjs's
 * `isProtectedPath` for the exact shape.
 * Anything else (docs, .claude/, config) is allowed on `main`.
 *
 * The branch is resolved against the git working tree that *contains the
 * file* (via `git -C <file-dir>`), not `process.cwd()`. This means:
 *   - A session on `main` writing to an absolute path inside a linked
 *     worktree on `feat/foo` is ALLOWED -- the worktree's branch is
 *     checked, not the session's.
 *   - A worktree accidentally checked out on `main` is STILL BLOCKED.
 *   - A non-git directory (no repo ancestor) returns "" -> never blocks.
 *
 * A detached HEAD sitting on the `main` commit IS treated as `main` -- it's
 * the same tree state the guard protects.
 *
 * Blocks by exiting 2 with a message on stderr.
 */
import process from "node:process";
import { existsSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalize,
  isAbsoluteLike,
  isProtectedPath,
} from "./lib/protected-paths.mjs";
export { isProtectedPath };

/**
 * Returns a git runner that executes every command with `git -C dir`, binding
 * the branch resolution to the working tree that contains the file being written.
 *
 * @param {string} dir Absolute directory path.
 * @returns {(args: string[]) => string}
 */
export function defaultGitFor(dir) {
  return function git(args) {
    try {
      return execFileSync("git", ["-C", dir, ...args], {
        encoding: "utf8",
      }).trim();
    } catch {
      return "";
    }
  };
}

/** Default runner bound to process.cwd() -- used as fallback / test default. */
const defaultGit = defaultGitFor(process.cwd());

/**
 * True when the working tree is effectively on `main`: either the checked-out
 * branch is `main`, or HEAD is detached but points at the exact `main` commit.
 *
 * @param {(args: string[]) => string} [git] git runner (trimmed stdout / "")
 * @returns {boolean}
 */
export function isMainOrDetachedOnMain(git = defaultGit) {
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch === "main") return true;
  if (branch === "HEAD") {
    const head = git(["rev-parse", "HEAD"]);
    const main = git(["rev-parse", "main"]);
    return head !== "" && head === main;
  }
  return false;
}

// Kept as a duplicated, self-contained block in every hook file rather than
// imported from a shared helper -- each hook stays a single independent
// file, which keeps this project's hook count easy to reason about against
// CLAUDE.md's hook budget. `import.meta.url` is symlink-resolved but
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

  // NotebookEdit carries `notebook_path`, not `file_path`.
  const filePath =
    input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? "";
  // Cheap, unscoped pre-check first (same cost as before this file's
  // scoping fix): anything that can't possibly be a guarded path by raw
  // substring is dismissed with no git shell-out at all.
  if (!isProtectedPath(filePath)) process.exit(0);

  // Bind git to the nearest EXISTING ancestor of the write target, not the
  // target directory itself -- a Write creating a brand-new nested
  // directory (e.g. `scripts/newdir/a.mjs` where `newdir/` doesn't exist yet)
  // means `git -C <that dir>` fails outright ("cannot change to ... No
  // such file or directory"), which would silently break EVERY git call
  // below, including branch detection -- the guard would then never learn
  // it's on `main` at all and allow the write through unblocked. Any
  // ancestor within the same worktree resolves the same repo root and
  // branch, so walking up costs nothing in accuracy.
  let probeDir = dirname(resolve(filePath));
  while (!existsSync(probeDir)) {
    const parent = dirname(probeDir);
    if (parent === probeDir) break; // filesystem root; let git fail naturally
    probeDir = parent;
  }
  const git = defaultGitFor(probeDir);
  const worktreeRoot = git(["rev-parse", "--show-toplevel"]);
  // Re-check scoped to the file's OWN worktree root (more accurate than a
  // guess from CLAUDE_PROJECT_DIR/cwd, and what this guard already resolves
  // everything else against): a checkout whose own path merely contains the
  // substring "/scripts/" above the worktree root (e.g. a clone at
  // ~/scripts/other-project) must not count as protected just because of that.
  // A non-git directory leaves worktreeRoot "" and skips this re-check,
  // same as the header comment's existing "never blocks" behavior. Both
  // sides go through `canonicalize` (case-correct, symlinks resolved)
  // before comparing -- see its own doc comment for why a raw string
  // comparison isn't safe here (macOS's case-insensitive filesystem and its
  // `/tmp`/`/var` symlinks both make two spellings of the identical file
  // compare as different paths otherwise). Only attempted for an ABSOLUTE
  // filePath: canonicalize() resolves a relative one against this process's
  // own cwd, which isn't necessarily the anchor a relative payload was
  // meant against -- the fast pre-check above already matched it correctly
  // as-is, so a relative path just keeps that verdict.
  if (
    worktreeRoot !== "" &&
    isAbsoluteLike(filePath) &&
    !isProtectedPath(canonicalize(filePath), canonicalize(worktreeRoot))
  ) {
    process.exit(0);
  }

  if (isMainOrDetachedOnMain(git)) {
    const inDifferentTree =
      worktreeRoot !== "" && resolve(worktreeRoot) !== resolve(process.cwd());
    const location = inDifferentTree
      ? `the worktree at \`${relative(process.cwd(), worktreeRoot) || worktreeRoot}\``
      : "HEAD";

    process.stderr.write(
      `Blocked: refusing to write \`${filePath}\` while ${location} is \`main\` ` +
        `(or detached on the \`main\` commit). Implementation work must run on ` +
        `an isolated branch/worktree -- run \`git switch -c feat/<slug>\` first.\n`,
    );
    process.exit(2);
  }

  process.exit(0);
}
