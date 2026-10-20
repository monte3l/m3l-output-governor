#!/usr/bin/env node
/**
 * PreToolUse guard (Bash): hold the read-only agents to a short list of
 * read-only commands.
 *
 * WHO IT COVERS. Only the agents defined in `.claude/agents/*.md` whose
 * frontmatter `name` is not in `WRITER_SPOKES` (`.claude/hooks/lib/agent-roster.mjs`,
 * empty here): Explore, code-reviewer and silent-failure-hunter. A call is
 * attributed to an agent by the hook payload's `agent_type`. **Everything else
 * passes unchecked**: the main session (no `agent_type`), built-in agents such
 * as `general-purpose`, and agents shipped by plugins (`plugin-dev:*`,
 * `claude-security:*`, ...), whether or not they hold Bash. That is deliberate,
 * since the main session and general-purpose agents must write files and a
 * plugin's patch generator must run builds, but it means this is a safety net
 * for three agents, not a barrier for every helper. To hold another agent to the
 * same rule, give it an entry in `.claude/agents/` with the same name, or narrow
 * its `tools`.
 *
 * HOW IT DECIDES. An allowlist. A command passes only if each of its segments
 * (split on `;`, `&&`, `||`, `|`, `&` and newlines) expands nothing (no `$`,
 * backtick or process substitution), redirects only to a discard target, assigns
 * no shell variable, names no secrets path, and runs a verb on READ_ONLY_VERBS or
 * in VERB_RULES with flags that pass that verb's rule. Everything else is
 * blocked, including every shell, wrapper (`sudo`, `env`, `xargs`, `timeout`,
 * `nice`, ...), interpreter (`python`, `awk`) and network tool.
 *
 * WHY AN ALLOWLIST. This file used to be a denylist of mutating commands, and
 * three security reviews in a row each found another way past it: `env -S`,
 * `sudo -u root`, `git diff --output=FILE`, `$(...)`, `timeout 5 rm`. A denylist
 * has to name every way to run something; an allowlist does not. The cost is
 * that a command nobody listed is blocked, which is the safe direction. Extend
 * the list one verb at a time, with a rule for any flag that writes or runs
 * something, and add a case to `.claude/tests/guard-readonly-bash.test.mjs`.
 *
 * WHAT IT CANNOT MAKE READ-ONLY. `node --test` and the docs check run repository
 * code, which can write files; no flag check changes that. `git` reads the
 * repository's own config, which can name programs (`core.fsmonitor`); it trusts
 * that config. `grep -r` over a tree can still read dotenv content, and `cd` can
 * leave the repository. The `main` ruleset and CI stay the real backstops.
 */
import process from "node:process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WRITER_SPOKES } from "./lib/agent-roster.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Extract the YAML frontmatter block's `name:` field, or `undefined`. CRLF
 * line endings are normalized first -- the frontmatter delimiter regex only
 * matches a bare `\n`, so an untouched CRLF file would never match at all,
 * silently producing zero read-only agents (which, per this hook's actual
 * usage, means the guard exits 0 -- allow -- for every agent). A quoted
 * value (`name: "some-agent"`) has its quotes stripped so it compares
 * correctly against `WRITER_SPOKES` and the incoming `agent_type`.
 */
function frontmatterName(filePath) {
  const content = readFileSync(filePath, "utf8")
    .replace(/^\uFEFF/, "") // a leading BOM (a realistic artifact of a Windows editor)
    .replace(/\r\n/g, "\n");
  const match = content.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (match === null) return undefined;
  const nameLine = match[1].split("\n").find((line) => /^name:\s*/.test(line));
  return nameLine
    ?.replace(/^name:\s*/, "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

/**
 * Every defined agent under `agentsDir` (`.claude/agents/*.md`) whose
 * frontmatter `name` is not in `WRITER_SPOKES`.
 *
 * @param {string} agentsDir absolute path to `.claude/agents/`
 * @returns {Set<string>}
 */
export function readOnlyAgentNames(agentsDir) {
  const names = new Set();
  if (!existsSync(agentsDir)) return names;
  for (const entry of readdirSync(agentsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const name = frontmatterName(join(agentsDir, entry.name));
    if (name !== undefined && !WRITER_SPOKES.has(name)) names.add(name);
  }
  return names;
}

/**
 * The length of the chain operator (`&&`, `||`, `|`, `&`, `;`, newline)
 * starting at `command[i]`, or 0 when there is none. A `|` immediately
 * preceded by `>` is the clobber-redirect operator (`>|`), not a pipe --
 * splitting it would chop `echo x >| file` into "echo x >" and "file", hiding
 * the redirect. Likewise a lone `&` is the background operator (which runs
 * the next command too) except where it belongs to a redirect: fd duplication
 * (`2>&1`, `>&2`, `<&3`) or the `&>`/`&>>` both-streams redirect.
 *
 * @param {string} command
 * @param {number} i
 * @returns {number}
 */
function chainOperatorLength(command, i) {
  const c = command[i];
  const next = command[i + 1];
  if ((c === "&" && next === "&") || (c === "|" && next === "|")) return 2;
  if (c === "|") return command[i - 1] === ">" ? 0 : 1;
  if (c === "&") {
    const prev = command[i - 1];
    return prev === ">" || prev === "<" || next === ">" ? 0 : 1;
  }
  return c === ";" || c === "\n" ? 1 : 0;
}

/**
 * Split `command` at every boundary `boundaryAt(command, i)` reports (the
 * boundary's length, 0 for none) that does not sit inside a quoted string.
 * Quotes pair the way a POSIX shell pairs them -- the same rules the redirect
 * scan in classifyBashCommand uses: a backslash outside single quotes escapes
 * the next character (so `\"` opens nothing and `"\""` stays open), a
 * backslash inside single quotes is literal, and `$'...'` honors `\'`.
 * Returns undefined when a quote never closes, so each caller can pick its own
 * fail-closed fallback.
 *
 * @param {string} command
 * @param {(command: string, i: number) => number} boundaryAt
 * @returns {string[] | undefined}
 */
function splitUnquoted(command, boundaryAt) {
  /** @type {string[]} */
  const parts = [];
  let start = 0;
  /** @type {"'" | '"' | "$'" | undefined} */
  let quote;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote === "'") {
      if (c === "'") quote = undefined;
    } else if (c === "\\") {
      i++; // escapes the next character (outside single quotes)
    } else if (quote !== undefined) {
      if (c === quote.at(-1)) quote = undefined;
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if (c === "$" && command[i + 1] === "'") {
      quote = "$'";
      i++;
    } else {
      const length = boundaryAt(command, i);
      if (length > 0) {
        parts.push(command.slice(start, i));
        i += length - 1;
        start = i + 1;
      }
    }
  }
  if (quote !== undefined) return undefined;
  parts.push(command.slice(start));
  return parts;
}

/**
 * Segment a shell command on its `&&`/`||`/`|`/`&`/`;`/newline chain operators,
 * ignoring any that sit inside a quoted string (`grep -E "a|b"`, `bash -c
 * 'x; y'`) -- see splitUnquoted. An unbalanced quote falls back to splitting
 * on every operator regardless of quoting (fail closed: an unterminated quote
 * must not hide a real chain).
 *
 * @param {string} command
 * @returns {string[]}
 */
function segments(command) {
  const parts =
    splitUnquoted(command, chainOperatorLength) ??
    command.split(/&&|\|\||(?<!>)\||(?<![<>])&(?!>)|;|\n/);
  return parts.map((s) => s.trim());
}

/**
 * Split one segment into its shell words on unquoted whitespace, keeping each
 * quoted span (quotes included) inside a single token, so `bash -c 'rm -rf
 * src'`'s payload is one token with its original whitespace intact. An
 * unbalanced quote falls back to a plain whitespace split.
 *
 * @param {string} segment
 * @returns {string[]}
 */
function words(segment) {
  const parts =
    splitUnquoted(segment, (s, i) => (/\s/.test(s[i]) ? 1 : 0)) ??
    segment.split(/\s+/);
  return parts.filter(Boolean);
}

/**
 * The value a shell gives one word (see `words`), with its quoting removed:
 * single quotes are literal, double quotes honor a backslash only before `$`,
 * a backtick, `"`, `\` or a newline, and an unquoted backslash escapes the
 * next character. Undefined when a quote never closes, or when the word uses
 * `$'...'` ANSI-C quoting (a `$'` outside any quotes), whose escapes (`\n`, `\x3e`, ...) can produce chain
 * operators and redirects this guard does not decode -- the caller fails
 * closed on undefined.
 *
 * @param {string} word
 * @returns {string | undefined}
 */
function shellWordValue(word) {
  let out = "";
  for (let i = 0; i < word.length; i++) {
    const c = word[i];
    if (c === "$" && word[i + 1] === "'") return undefined;
    if (c === "'") {
      const end = word.indexOf("'", i + 1);
      if (end === -1) return undefined;
      out += word.slice(i + 1, end);
      i = end;
    } else if (c === '"') {
      let j = i + 1;
      for (; j < word.length && word[j] !== '"'; j++) {
        if (word[j] === "\\" && j + 1 < word.length) {
          if ('$`"\\\n'.includes(word[j + 1])) j++;
        }
        out += word[j];
      }
      if (j >= word.length) return undefined;
      i = j;
    } else if (c === "\\") {
      i++;
      out += word[i] ?? "";
    } else {
      out += c;
    }
  }
  return out;
}

/**
 * One shell word: `raw` is its source text (quotes included), `value` what the
 * shell makes of it (shellWordValue) -- undefined when it cannot be read.
 * Every verb/subcommand/flag comparison uses `value` (or `raw` when there is
 * none), so `"rm" x`, `r\m x` and `git "commit"` match exactly as bash runs
 * them; `raw` is kept for the things quoting itself decides: whether a word is
 * a `VAR=value` assignment, and a nested `-c` payload, which is re-parsed.
 *
 * @typedef {{ raw: string, value: string | undefined, fromEnvSplit?: boolean, resplit?: boolean, envRefusal?: string }} Word
 */

/** @param {string} raw @returns {Word} */
function toWord(raw) {
  return { raw, value: shellWordValue(raw) };
}

/** The text a word is matched by: its unquoted value, else its raw text. */
function wordText(word) {
  return word.value ?? word.raw;
}

/** Strip a leading path (e.g. `/usr/bin/rm` -> `rm`) for verb comparison. */
function baseName(token) {
  const parts = token.split(/[/\\]/);
  return parts[parts.length - 1];
}

/**
 * Drop a subshell's closing `)` glued to a segment's last word (`(git
 * commit)` -> `git commit`), so it cannot defeat a verb/subcommand match. Only
 * surplus `)` are dropped -- a balanced `$(date)` is left intact -- and a word
 * that is nothing but `)` disappears.
 *
 * @param {Word[]} list
 * @returns {Word[]}
 */
function stripClosingParens(list) {
  const last = list.at(-1);
  if (last === undefined) return list;
  let end = last.raw;
  const opens = (end.match(/\(/g) ?? []).length;
  while (
    end.endsWith(")") &&
    !end.endsWith("\\)") &&
    (end.match(/\)/g) ?? []).length > opens
  ) {
    end = end.slice(0, -1);
  }
  if (end === last.raw) return list;
  const head = list.slice(0, -1);
  return end === "" ? head : [...head, toWord(end)];
}

// git branch/tag: judged against an allowlist of their read-only flags, since their
// flag surfaces take unique-prefix abbreviations and bundled values that no denylist
// of spellings can keep up with.
/** @typedef {{ value: "none" | "optional" | "required", pattern?: true }} ReadFlagSpec */

// The ALLOWLISTS of `git branch`'s and `git tag`'s read-only flags (see the
// module header for why these two are allowlisted), keyed by exact flag name.
// `value` says how the flag takes an argument: "none" (no `=value` form
// accepted), "optional" (inline `--flag=value` only), or "required" (inline,
// or else the following token is consumed as its value). `pattern` marks the
// flags that put the command in list mode, where a positional is a pattern to
// match rather than a name to create -- `-v`/`-a`/`-r` do NOT (`git branch -v
// newb` creates `newb`).
const GIT_BRANCH_READ_FLAGS = new Map(
  /** @type {[string, ReadFlagSpec][]} */ ([
    ["--show-current", { value: "none" }],
    ["-a", { value: "none" }],
    ["--all", { value: "none" }],
    ["-r", { value: "none" }],
    ["--remotes", { value: "none" }],
    ["-v", { value: "none" }],
    ["-vv", { value: "none" }],
    ["--verbose", { value: "none" }],
    ["-i", { value: "none" }],
    ["--ignore-case", { value: "none" }],
    ["--omit-empty", { value: "none" }],
    ["--no-color", { value: "none" }],
    ["--no-column", { value: "none" }],
    ["--no-abbrev", { value: "none" }],
    ["--color", { value: "optional" }],
    ["--column", { value: "optional" }],
    ["--abbrev", { value: "optional" }],
    ["--sort", { value: "required" }],
    ["--format", { value: "required" }],
    ["--list", { value: "none", pattern: true }],
    ["-l", { value: "none", pattern: true }],
    ["--merged", { value: "optional", pattern: true }],
    ["--no-merged", { value: "optional", pattern: true }],
    ["--contains", { value: "optional", pattern: true }],
    ["--no-contains", { value: "optional", pattern: true }],
    ["--points-at", { value: "optional", pattern: true }],
  ]),
);

// `git tag`'s counterpart of GIT_BRANCH_READ_FLAGS. `-n` also accepts attached
// digits (`-n3`), normalized to `-n` before lookup by isReadOnlyGitTag; it
// implies list mode, so a following positional is a pattern.
const GIT_TAG_READ_FLAGS = new Map(
  /** @type {[string, ReadFlagSpec][]} */ ([
    ["-n", { value: "none", pattern: true }],
    ["-i", { value: "none" }],
    ["--ignore-case", { value: "none" }],
    ["--omit-empty", { value: "none" }],
    ["--no-color", { value: "none" }],
    ["--no-column", { value: "none" }],
    ["--color", { value: "optional" }],
    ["--column", { value: "optional" }],
    ["--sort", { value: "required" }],
    ["--format", { value: "required" }],
    ["-l", { value: "none", pattern: true }],
    ["--list", { value: "none", pattern: true }],
    ["--contains", { value: "optional", pattern: true }],
    ["--no-contains", { value: "optional", pattern: true }],
    ["--merged", { value: "optional", pattern: true }],
    ["--no-merged", { value: "optional", pattern: true }],
    ["--points-at", { value: "required", pattern: true }],
  ]),
);

/**
 * Whether `<args>` is a read-only invocation per the flag allowlist `table`:
 * every flag is on it (in a form it accepts), and there is either no
 * positional or a pattern-taking flag that makes positionals patterns. A
 * "required"-value flag given without `=` consumes the next token, so that
 * value can never be mistaken for a flag (`--format -l v2` is create mode).
 *
 * @param {Map<string, ReadFlagSpec>} table
 * @param {string[]} args
 * @returns {boolean}
 */
function isReadOnlyByFlagTable(table, args) {
  let listMode = false;
  let positional = false;
  for (let k = 0; k < args.length; k++) {
    const arg = args[k];
    if (!arg.startsWith("-")) {
      positional = true;
      continue;
    }
    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const spec = table.get(name);
    if (spec === undefined) return false; // unknown, abbreviated or bundled
    if (eq !== -1 && spec.value === "none") return false;
    if (spec.pattern === true) listMode = true;
    if (eq === -1 && spec.value === "required") k++; // consume its value
  }
  return !positional || listMode;
}

/** `git branch <args>` is read-only, per GIT_BRANCH_READ_FLAGS. */
function isReadOnlyGitBranch(args) {
  return isReadOnlyByFlagTable(GIT_BRANCH_READ_FLAGS, args);
}

/** `git tag <args>` is read-only, per GIT_TAG_READ_FLAGS (`-n3` -> `-n`). */
function isReadOnlyGitTag(args) {
  return isReadOnlyByFlagTable(
    GIT_TAG_READ_FLAGS,
    args.map((a) => (/^-n\d+$/.test(a) ? "-n" : a)),
  );
}

const GIT_CONFIG_READ = new Set([
  "--get",
  "--get-all",
  "--get-regexp",
  "--get-urlmatch",
  "--list",
  "-l",
]);
const GIT_CONFIG_WRITE = new Set([
  "--add",
  "--unset",
  "--unset-all",
  "--replace-all",
  "--edit",
  "-e",
  "--rename-section",
  "--remove-section",
]);

/**
 * A write redirection to anything but a discard target, as a verdict, else
 * undefined.
 *
 * @param {string} segment
 * @returns {Blocked | undefined}
 */
function redirectVerdict(segment) {
  // Write-redirection to a real file (not a discard target). No digit
  // lookbehind: `1>file`/`2>file` are ordinary fd-prefixed writes, not fd
  // duplication -- `2>&1` is excluded below as a `>&` operator whose target
  // is a digit string (see the `>&word` note). Global flag: a
  // segment can carry more than one redirect (`cmd > /dev/null > real`),
  // and a decoy discard target must not short-circuit the scan past a
  // real one that follows it.
  //
  // Quoted spans are blanked first unless they ARE a redirect's target, so
  // a `>` inside a quoted argument (`grep "=> {" src`, `--format="%h > %s"`)
  // is not mistaken for a redirect, while `echo x > "out.txt"` keeps its
  // quoted target and is classified exactly as an unquoted one. Quotes are
  // paired the way a POSIX shell pairs them: a backslash-escaped quote
  // outside quotes (`\"`) is a literal and opens nothing, `\"` inside double
  // quotes does not close them, and a backslash inside single quotes is
  // literal. An unbalanced quote is left un-blanked (fail closed).
  //
  // Two cases skip blanking, also failing closed. A double-quoted span
  // holding a `$(...)`/backtick command substitution is kept, since the
  // shell still runs the substitution -- a `>` inside it is a real redirect
  // (`echo "$(date > out)"`). And a segment using `$'...'` ANSI-C quoting is
  // not blanked at all: its `\'` escape pairs differently from a plain
  // single quote, so the pairing above would desync and swallow a real
  // redirect that follows (`echo $'\'' > out #'`).
  const scan = segment.includes("$'")
    ? segment
    : segment.replace(
        /(>{1,2}[|&]?\s*)?(?<!\\)(?:'[^']*'|"(?:\\[\s\S]|[^\\"])*")/g,
        (match, redirectOp) =>
          redirectOp !== undefined ||
          (match[0] === '"' && /\$\(|`/.test(match))
            ? match
            : `${match[0]}${match[0]}`,
      );
  //
  // `>&word` is fd duplication only when `word` is a digit string or `-`
  // (`>&2`, `2>&1`, `>&-`); any other word is a FILE both stdout and stderr
  // are written to (`>&out.txt`, `>& out.txt`), so that form is matched as
  // its own operator and its target examined like any other.
  for (const redirect of scan.matchAll(/(>&|>{1,2}\|?)\s*([^\s&|;]+)/g)) {
    const target = redirect[2].replace(/^["']|["']$/g, "");
    if (redirect[1] === ">&" && /^(?:\d+|-)$/.test(target)) continue;
    if (!/^(\/dev\/null|nul)$/i.test(target)) {
      return {
        blocked: true,
        reason: `writes to "${redirect[2]}" via shell redirection ("${redirect[0]}")`,
      };
    }
  }
  return undefined;
}

/** @typedef {{ blocked: true, reason: string }} Blocked */

/** @param {string} reason @returns {Blocked} */
const block = (reason) => ({ blocked: true, reason });

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

// Words that open a compound command rather than name a program, so the word
// after them is what runs. `for`/`select`/`case` open a header that names no
// command at all (its body is a later segment), and the closers name none either.
// `case` is deliberately not a header: its first pattern's command follows a `)` in
// the same segment (`case x in x) rm x ;; esac`), so it stays an unlisted verb.
const OPENERS = new Set(["if", "then", "else", "elif", "do", "while", "until", "!", "{"]);
const HEADERS = new Set(["for", "select"]);
const CLOSERS = new Set(["done", "fi", "esac", "}", ")", ";;"]);

/**
 * The words of one segment that name and feed its command: leading reserved
 * words and a glued `(` or `{` dropped, a header or closer reduced to nothing,
 * and a closing `)` glued to the last word dropped.
 *
 * @param {Word[]} input
 * @returns {Word[]}
 */
function commandWords(input) {
  const list = [...input];
  while (list.length > 0) {
    const first = list[0];
    const glued = /^[({]+/.exec(first.raw)?.[0];
    if (glued !== undefined) {
      const rest = first.raw.slice(glued.length);
      if (rest === "") list.shift();
      else list[0] = toWord(rest);
      continue;
    }
    const text = wordText(first);
    if (text.startsWith("#")) return [];
    if (OPENERS.has(text)) {
      list.shift();
      continue;
    }
    if (HEADERS.has(text) || CLOSERS.has(text)) return [];
    break;
  }
  return stripClosingParens(list);
}

/**
 * Why a segment cannot be judged by its words alone: it expands a variable,
 * runs a command substitution (`$(...)`, a backtick) or a process substitution
 * (`<(...)`, `>(...)`), any of which can run or reveal something the words do
 * not show. Quotes are tracked as the shell tracks them: single quotes make
 * everything literal, a backslash escapes the next character outside single
 * quotes, and a double quote still expands `$` and a backtick.
 *
 * @param {string} segment
 * @returns {string | undefined}
 */
function expansionReason(segment) {
  let single = false;
  let double = false;
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    if (single) {
      if (c === "'") single = false;
      continue;
    }
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === "'" && !double) {
      single = true;
      continue;
    }
    if (c === '"') {
      double = !double;
      continue;
    }
    if (c === "`") return "uses command substitution (a backtick)";
    if (c === "$" && /[A-Za-z0-9_{(\[@*#!$?-]/.test(segment[i + 1] ?? "")) {
      return "expands a variable or runs a command substitution ($)";
    }
    if (!double && (c === "<" || c === ">") && segment[i + 1] === "(") {
      return "uses process substitution";
    }
  }
  return undefined;
}

// Programs found by path are judged by their name, so only the system
// directories count: `./cat` or `/tmp/x/cat` would run whatever file is there.
const SYSTEM_BIN =
  /^(?:\/usr\/local\/bin|\/usr\/bin|\/bin|\/opt\/homebrew\/bin|\/opt\/local\/bin|\/home\/linuxbrew\/\.linuxbrew\/bin)\/[A-Za-z0-9._+-]+$/;

// Paths a read-only agent has no business reading: dotenv files (not the
// `.env.example` kind), key files and the directories credentials live in. The
// `permissions.deny` Read rules cover the Read tool only, not Bash.
const SECRET_DIRS = new Set(["secrets", ".ssh", ".aws", ".gnupg", ".oci", ".kube"]);
const SECRET_FILES =
  /^(?:\.env(?:\..+)?|\.npmrc|\.netrc|\.claude\.json|\.credentials\.json|id_rsa|id_ed25519|id_ecdsa|credentials|.+\.(?:pem|key|p12|pfx))$/;
const PUBLIC_ENV = /^\.env\.(?:example|sample|template|dist)$/;

/**
 * @param {string} token
 * @returns {boolean}
 */
function isSecretPath(token) {
  const candidates = token.includes("=")
    ? [token, token.slice(token.indexOf("=") + 1)]
    : [token];
  return candidates.some((candidate) => {
    // `:` splits git's `REV:path` form (`HEAD:.env`) the way `/` splits a path.
    const parts = candidate.split(/[/\\:]/);
    const base = parts[parts.length - 1];
    if (PUBLIC_ENV.test(base)) return false;
    // /proc/<pid>/environ holds the whole environment, API keys included.
    if (base === "environ" && parts.includes("proc")) return true;
    return (
      SECRET_FILES.test(base) ||
      SECRET_DIRS.has(base) ||
      parts.slice(0, -1).some((p) => SECRET_DIRS.has(p))
    );
  });
}

/**
 * Whether `token` is a long option spelled out or abbreviated to a prefix of
 * one of `names`. getopt-style parsers (git, GNU sort) accept any unique
 * prefix, so `--out` means `--output`; matching every prefix errs on the side
 * of blocking.
 *
 * @param {string} token
 * @param {readonly string[]} names option names without the leading `--`
 * @returns {boolean}
 */
function matchesLongOption(token, names) {
  if (!token.startsWith("--")) return false;
  const name = token.slice(2).split("=")[0];
  return name.length > 0 && names.some((n) => n.startsWith(name));
}

// Verbs a read-only agent may run with no further check: they only read files
// or print. Anything not here, and not in VERB_RULES, is blocked. That default
// is the point: a denylist has to name every way to run something, an
// allowlist does not. Extend it deliberately, one verb at a time.
const READ_ONLY_VERBS = new Set([
  "ls", "cat", "head", "tail", "wc", "stat", "du", "df", "pwd", "cd",
  "basename", "dirname", "realpath", "readlink",
  "grep", "egrep", "fgrep", "nl", "cut", "tr", "comm", "cmp", "diff",
  "od", "hexdump", "strings", "md5sum", "shasum", "cksum", "column", "tac", "rev", "fold",
  "echo", "printf", "true", "false", "test", "[", "[[", "sleep", "seq",
  "whoami", "uname", "which", "type",
]);

// Subcommands of `git` that only read. `branch`, `tag`, `config`, `stash`,
// `worktree`, `remote` and `reflog` also have a writing form, so each is judged
// by GIT_FORMS instead.
const GIT_READ_SUBS = new Set([
  "status", "diff", "log", "show", "blame", "cat-file", "ls-files", "ls-tree",
  "rev-parse", "rev-list", "describe", "merge-base", "for-each-ref", "show-ref",
  "grep", "shortlog", "diff-tree", "diff-index", "diff-files", "name-rev",
  "show-branch", "cherry", "range-diff", "check-ignore", "check-attr", "count-objects",
]);
const GIT_FORMS = {
  branch: isReadOnlyGitBranch,
  tag: isReadOnlyGitTag,
  config: (/** @type {string[]} */ args) =>
    (args[0] === "get" || args[0] === "list" || args.some((a) => GIT_CONFIG_READ.has(a))) &&
    !args.some((a) => GIT_CONFIG_WRITE.has(a)),
  stash: (/** @type {string[]} */ args) => args[0] === "list" || args[0] === "show",
  worktree: (/** @type {string[]} */ args) => args[0] === "list",
  remote: (/** @type {string[]} */ args) =>
    args.length === 0 ||
    args.every((a) => a === "-v" || a === "--verbose") ||
    (args[0] === "get-url" && args.length === 2),
  reflog: (/** @type {string[]} */ args) => !args.some((a) => /^(?:expire|delete|drop)$/.test(a)),
};
// git options that run a program or write a file, whatever the subcommand. A
// prefix of one is refused too (`--ext` is `--ext-diff`), and so is `-O` for
// `git grep`.
const GIT_EXEC_LONG = [
  "upload-pack", "receive-pack", "exec", "ext-diff", "extcmd", "open-files-in-pager", "output",
];
// The only global options accepted before the subcommand. `-c`, `-C`,
// `--exec-path`, `--paginate`, `--config-env` and the rest can change what git
// runs or where it looks, so they are refused.
const GIT_GLOBAL_OK = new Set([
  "--no-pager", "-P", "--no-optional-locks", "--no-replace-objects",
  "--literal-pathspecs", "--glob-pathspecs", "--noglob-pathspecs", "--icase-pathspecs",
]);

/** @param {string[]} args @returns {string | undefined} */
function gitRule(args) {
  let k = 0;
  while (k < args.length && args[k].startsWith("-")) {
    if (!GIT_GLOBAL_OK.has(args[k])) {
      return `with the option ${args[k]}, which can change what git runs`;
    }
    k++;
  }
  const sub = args[k];
  if (sub === undefined) return undefined;
  const rest = args.slice(k + 1);
  if (Object.hasOwn(GIT_FORMS, sub)) {
    if (!GIT_FORMS[/** @type {keyof typeof GIT_FORMS} */ (sub)](rest)) {
      return `with "${[sub, ...rest].join(" ")}", which is not a read-only form`;
    }
  } else if (!GIT_READ_SUBS.has(sub)) {
    return `with "${sub}", which is not a read-only git command`;
  }
  for (const t of rest) {
    if (t === "--") break;
    if (matchesLongOption(t, GIT_EXEC_LONG)) {
      return `with ${t}, which runs a program or writes a file`;
    }
    if (sub === "grep" && /^-O/.test(t)) {
      return `with ${t}, which runs a program`;
    }
    if (/^(?:ext|fd)::/.test(t)) {
      return `with ${t}, a transport that runs a program`;
    }
  }
  return undefined;
}

// node options that run code given on the command line or load a module or
// debugger before the script does. A script still runs repository code (that
// is how `node --test` and the docs check work), which no flag check can make
// read-only; a script path outside the repository is refused.
const NODE_UNSAFE =
  /^(?:-e|-p|-pe|-ep|-r|--eval|--print|--require|--import|--loader|--experimental-loader|--input-type|--inspect(?:-brk|-wait|-port)?|--env-file|--env-file-if-exists|--run)(?:=|$)/;

/** @param {string[]} args @returns {string | undefined} */
function nodeRule(args) {
  let mode = false;
  let testMode = false;
  let positional = 0;
  for (const a of args) {
    if (NODE_UNSAFE.test(a)) return `with ${a}, which runs code from the command line or loads a module`;
    if (a === "-") return "with -, which reads a program from standard input";
    if (a.startsWith("-")) {
      if (/^(?:--test(?:-.*)?|--check|-c|--version|-v|--help|-h)$/.test(a)) mode = true;
      if (/^--test(?:-.*)?$/.test(a)) testMode = true;
      continue;
    }
    positional++;
    // The first positional is the script; with --test every positional is a test file.
    // A script's own arguments (`measure.mjs /some/transcripts`) are its business.
    if (
      (positional === 1 || testMode) &&
      (a.startsWith("/") || a.startsWith("~") || a.split("/").includes(".."))
    ) {
      return `with ${a}, a path outside the repository`;
    }
  }
  if (positional === 0 && !mode) return "with no script, which would read a program from standard input";
  return undefined;
}

// `sed` is allowed only to print: one line or range, or a line matching a
// pattern, with -n. Its `w`, `e` and `r` commands and its `s///e` and
// `s///w` flags write files or run commands, and a script cannot be vetted
// without a parser, so anything else is refused.
const SED_ADDR = String.raw`(?:\d+|\$|\/[^\/\\;{}]*\/)`;
const SED_PRINT = new RegExp(String.raw`^\s*${SED_ADDR}(?:\s*,\s*${SED_ADDR})?\s*[p=]\s*$`);

/** @param {string[]} args @returns {string | undefined} */
function sedRule(args) {
  let script;
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (["-n", "--quiet", "--silent", "-E", "-r", "--regexp-extended"].includes(a)) continue;
    if (a === "-e" || a === "--expression") {
      if (script !== undefined || args[k + 1] === undefined) return "with an unreadable script";
      script = args[++k];
      continue;
    }
    if (a.startsWith("-")) return `with ${a}, which can edit files or run a script file`;
    if (script === undefined) {
      script = a;
      continue;
    }
  }
  if (script === undefined) return "with no script";
  return SED_PRINT.test(script) ? undefined : "with a script other than a print, which can write files or run commands";
}

const FIND_UNSAFE = new Set([
  "-exec", "-execdir", "-ok", "-okdir", "-delete", "-fprint", "-fprint0", "-fprintf", "-fls",
]);

/** @type {Map<string, (args: string[]) => string | undefined>} */
const VERB_RULES = new Map([
  ["git", gitRule],
  ["node", nodeRule],
  ["sed", sedRule],
  [
    "claude",
    (args) =>
      args.length === 1 && /^(?:--version|-v|--help|-h)$/.test(args[0])
        ? undefined
        : args[0] === "plugin" && (args[1] === "validate" || args[1] === "list")
          ? undefined
          : "with anything but `plugin validate`, `plugin list` or --version, which can start a session or change settings",
  ],
  [
    "reuse",
    (args) =>
      /^(?:lint|--version|--help)$/.test(args[0] ?? "") ? undefined : `with "${args[0] ?? ""}", which can rewrite files`,
  ],
  [
    "find",
    (args) => {
      const bad = args.find((a) => FIND_UNSAFE.has(a));
      return bad === undefined ? undefined : `with ${bad}, which runs a command or writes a file`;
    },
  ],
  [
    "sort",
    (args) => {
      for (const a of args) {
        if (a === "--") break;
        if (matchesLongOption(a, ["output", "compress-program"])) return `with ${a}, which writes a file or runs a program`;
        if (/^-[^-]*o/.test(a)) return `with ${a}, which writes a file`;
      }
      return undefined;
    },
  ],
  [
    "uniq",
    (args) => {
      let positional = 0;
      for (let k = 0; k < args.length; k++) {
        if (["-f", "-s", "-w"].includes(args[k])) k++;
        else if (!args[k].startsWith("-")) positional++;
      }
      return positional > 1 ? "with an output file, which it writes" : undefined;
    },
  ],
  [
    "rg",
    (args) => {
      const bad = args.find((a) => /^--(?:pre|hostname-bin)(?:=|$)/.test(a));
      return bad === undefined ? undefined : `with ${bad}, which runs a program`;
    },
  ],
]);

/**
 * Judge the command one segment runs, from its words alone.
 *
 * @param {Word[]} list the words left once the segment's leading reserved
 *   words are dropped (see commandWords)
 * @returns {Blocked | undefined}
 */
function classifyWords(list) {
  if (list.length === 0) return undefined;
  // A leading shell assignment is refused even on its own: `PATH=/tmp/x` changes which
  // program every later segment runs, and `FOO=1 cmd` hands cmd a variable.
  if (ASSIGNMENT.test(list[0].raw)) {
    return block("sets a shell variable, which can change what later commands run");
  }
  const first = list[0];
  if (first.value === undefined) {
    return block(`runs a command word (${first.raw}) whose quoting could not be read`);
  }
  const name = first.value;
  if (/\s/.test(name)) return block("runs a quoted command string instead of a program name");
  if (name.includes("/") && !SYSTEM_BIN.test(name)) {
    return block(`runs a program by path (${name}), which is not a system command`);
  }
  if (list.some((w) => w.value === undefined)) {
    return block("has an argument whose quoting could not be read");
  }
  const verb = baseName(name);
  const tokens = list.slice(1).map((w) => /** @type {string} */ (w.value));
  const secret = tokens.find(isSecretPath);
  if (secret !== undefined) return block(`names a secrets path (${secret})`);
  const rule = VERB_RULES.get(verb);
  if (rule === undefined && !READ_ONLY_VERBS.has(verb)) {
    return block(`runs "${verb}", which is not on the read-only command list`);
  }
  const why = rule?.(tokens);
  return why === undefined ? undefined : block(`runs "${verb}" ${why}`);
}

/**
 * Classify a shell command as blocked or allowed for a read-only spoke. An
 * allowlist: a command passes only if every segment expands nothing, redirects
 * only to a discard target, and runs a verb on READ_ONLY_VERBS (or in
 * VERB_RULES, with flags that pass its rule).
 *
 * @param {string} command
 * @returns {{ blocked: boolean, reason?: string }}
 */
export function classifyBashCommand(command) {
  if (typeof command !== "string" || command.trim().length === 0) {
    return { blocked: false };
  }
  for (const segment of segments(command)) {
    if (segment.length === 0) continue;
    const expansion = expansionReason(segment);
    if (expansion !== undefined) return block(expansion);
    const redirect = redirectVerdict(segment);
    if (redirect !== undefined) return redirect;
    const verdict = classifyWords(commandWords(words(segment).map(toWord)));
    if (verdict !== undefined) return verdict;
  }
  return { blocked: false };
}

// Deliberately inlined in every hook rather than shared, so each hook stays
// one self-contained file.
// `import.meta.url` is symlink-resolved but `process.argv[1]` is not, so
// comparing them directly is false under any symlinked path and the body would
// never run -- exit 0.
function isEntryPoint() {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

// Only run when invoked directly, not when imported for testing.
if (isEntryPoint()) {
  const raw = await readStdin();
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  if (typeof input !== "object" || input === null) process.exit(0);
  const agentType = input.agent_type;
  if (typeof agentType !== "string" || agentType.length === 0) process.exit(0);

  let readOnly;
  try {
    readOnly = readOnlyAgentNames(join(root, ".claude/agents"));
  } catch {
    process.exit(0); // can't determine the roster -> defer, don't wedge
  }
  if (!readOnly.has(agentType)) process.exit(0);

  const command = input.tool_input?.command;
  const verdict = classifyBashCommand(
    typeof command === "string" ? command : "",
  );
  if (!verdict.blocked) process.exit(0);

  process.stderr.write(`\
[guard-readonly-bash] Blocked: the "${agentType}" spoke is read-only, but this
command ${verdict.reason}.

Read-only spokes may run only the commands on READ_ONLY_VERBS in
.claude/hooks/guard-readonly-bash.mjs, and nothing that expands a variable, runs a
substitution or writes a file. If this command is genuinely needed, report it to the
main session, which makes the change, instead of running it here.
`);
  process.exit(2);
}
