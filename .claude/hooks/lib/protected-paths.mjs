// Single source of truth for the guarded code path shape used by the Claude
// hook layer to stop writes to this repository's code while HEAD is main.
// Used by .claude/hooks/guard-branch-isolation.mjs.
//
// This repository has no src/ tree: its code is the plugin's scripts, evals,
// tests, skill and manifests. Those top-level directories are the protected
// set. Docs, CI workflows and .claude/ itself stay writable on main so a
// harness fix is not blocked by the guard it is repairing (the main ruleset
// still requires a PR for every change).

import { realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const WINDOWS_DRIVE = /^[A-Za-z]:/;

const GUARDED = "(scripts|evals|tests|skills|\\.claude-plugin)\\/";
// Both patterns are case-insensitive: on a case-insensitive filesystem (macOS
// APFS, Windows) `Scripts/x.mjs` is the same file as `scripts/x.mjs`, so a
// case-sensitive match would let a re-cased path past the guard.
/** Scoped to a known project: the guarded directory must be a top-level one. */
const PROTECTED_AT_ROOT = new RegExp(`^${GUARDED}`, "i");
/** Unscoped pre-filter: the guarded name at any path boundary, deliberately broad. */
const PROTECTED_ANYWHERE = new RegExp(`(^|\\/)${GUARDED}`, "i");

/** `\` and `/` both normalized to `/`, so a Windows-style path is matched the same as a POSIX one. */
function normalizeSlashes(path) {
  return path.replace(/\\/g, "/");
}

/** Exported so a caller can decide whether canonicalizing a path even makes sense (a relative path has no filesystem anchor of its own to resolve against). */
export function isAbsoluteLike(path) {
  return path.startsWith("/") || WINDOWS_DRIVE.test(path);
}

/**
 * Returns true if `filePath` sits under one of this repository's guarded
 * top-level directories (`scripts/`, `evals/`, `tests/`, `skills/`,
 * `.claude-plugin/`). With `projectDir` the match is anchored at the project
 * root; without it the guarded name may sit at any path boundary, which makes
 * that call a broad pre-filter and never the final answer.
 *
 * `projectDir`, when given, scopes an ABSOLUTE `filePath` to the project
 * before applying that check: the path is made relative to `projectDir` by
 * literal string prefix, not `node:path` (whose `relative`/`isAbsolute` are
 * host-OS-dependent), so the same logic works identically on POSIX and
 * Windows-style paths regardless of which OS is actually running the hook.
 * An absolute path that does not start with `projectDir` is outside the
 * project entirely and is never protected -- this is what stops a checkout
 * living under a path that happens to contain the literal substring `/src/`
 * (e.g. `~/src/other-project`) from being treated as protected merely
 * because that substring appears somewhere above the real project root.
 *
 * A relative `filePath` (or a call with no `projectDir`) is matched as-is,
 * after slash normalization -- the same behavior this function has always had.
 *
 * @param {string} filePath
 * @param {string} [projectDir]
 * @returns {boolean}
 */
export function isProtectedPath(filePath, projectDir) {
  const path = normalizeSlashes(filePath);
  let candidate = path;

  if (isAbsoluteLike(path) && typeof projectDir === "string") {
    const root = normalizeSlashes(projectDir).replace(/\/+$/, "");
    // Compared case-INSENSITIVELY (macOS's default APFS, and Windows, are
    // both case-insensitive-but-case-preserving -- a `filePath` spelled with
    // different case than `projectDir` can still denote the identical real
    // file). This holds even when the caller couldn't fully canonicalize a
    // not-yet-existing path against the real filesystem (see
    // `canonicalize()` below) and matters more than it costs: on a
    // genuinely case-SENSITIVE filesystem this can only make the check
    // MORE conservative (occasionally treating two truly-different,
    // same-spelled-but-cased directories as the same project), never less --
    // and erring toward "still protected" is the safe side for a guard.
    const pathLower = path.toLowerCase();
    const rootLower = root.toLowerCase();
    if (pathLower === rootLower || pathLower.startsWith(`${rootLower}/`)) {
      candidate = path.slice(root.length).replace(/^\/+/, "");
    } else {
      return false;
    }
  }

  const guarded =
    typeof projectDir === "string" ? PROTECTED_AT_ROOT : PROTECTED_ANYWHERE;
  return guarded.test(candidate);
}

/**
 * Resolves `path` to its canonical, case-correct, symlink-resolved form,
 * via the deepest existing ancestor -- never throws, even for a path (or a
 * tail of one) that doesn't exist yet, e.g. a file a Write is about to
 * create in a directory that doesn't exist yet either.
 *
 * Uses `realpathSync.native`, not plain `realpathSync`: on a
 * case-insensitive-but-case-preserving filesystem (macOS's default APFS),
 * only the native variant corrects a wrongly-cased spelling to the real
 * on-disk case -- the same canonical case `git rev-parse --show-toplevel`
 * already returns. Comparing an un-canonicalized `filePath` against a
 * canonicalized `projectDir`/worktree root (or vice versa) would otherwise
 * make two spellings of the identical file compare as different paths,
 * which is exactly the shape of bug this function exists to close.
 *
 * @param {string} path
 * @returns {string}
 */
export function canonicalize(path) {
  const absolute = resolve(path);
  const tail = [];
  let candidate = absolute;
  while (true) {
    try {
      const real = realpathSync.native(candidate);
      return tail.length === 0 ? real : join(real, ...tail.reverse());
    } catch {
      const parent = dirname(candidate);
      if (parent === candidate) return absolute; // filesystem root; give up
      tail.push(basename(candidate));
      candidate = parent;
    }
  }
}
