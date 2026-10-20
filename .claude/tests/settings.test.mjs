// Integrity tests for .claude/settings.json and the hooks it registers.
// Run: node --test .claude/tests/settings.test.mjs
//
// Every PreToolUse guard fails closed (`onFailure: "block"`), so a hook that is
// missing, cannot be imported or crashes blocks every Bash, Write and Edit call.
// That is how a half-installed settings file once locked the whole session. These
// tests are what makes fail-closed safe to keep: they run in CI and by hand before
// any change to a hook or to settings.json is trusted.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const CLAUDE = join(dirname(fileURLToPath(import.meta.url)), "..");
const settings = JSON.parse(readFileSync(join(CLAUDE, "settings.json"), "utf8"));

/** Every `{ command }` object anywhere in settings, with the event it sits under. */
function commands() {
  const found = [];
  const walk = (node, event) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, event));
    if (node === null || typeof node !== "object") return;
    if (typeof node.command === "string") found.push({ ...node, event });
    for (const [key, value] of Object.entries(node)) {
      walk(value, settings.hooks && key in settings.hooks ? key : event);
    }
  };
  walk(settings, undefined);
  return found;
}

const hookFile = (command) => command.match(/\.claude\/hooks\/([\w.-]+\.mjs)/)?.[1];
const guards = commands().filter((c) => c.event === "PreToolUse");

test("every command in settings names a hook file that exists", () => {
  const all = commands();
  assert.ok(all.length >= 11, `expected at least 11 commands, found ${all.length}`);
  for (const c of all) {
    const file = hookFile(c.command);
    assert.ok(file, `no .claude/hooks/*.mjs in: ${c.command}`);
    assert.ok(existsSync(join(CLAUDE, "hooks", file)), `${file} is registered but missing`);
  }
});

test("every registered hook imports cleanly", async () => {
  for (const file of new Set(commands().map((c) => hookFile(c.command)))) {
    // An import that fails (a wrong path, a missing export) is what turns a guard into a lockout.
    await import(pathToFileURL(join(CLAUDE, "hooks", file)).href);
  }
});

test("no file in .claude/hooks is an orphan", () => {
  const registered = new Set(commands().map((c) => hookFile(c.command)));
  const imported = new Set();
  for (const file of registered) {
    const source = readFileSync(join(CLAUDE, "hooks", file), "utf8");
    for (const m of source.matchAll(/from "\.\/([\w.-]+\.mjs)"/g)) imported.add(m[1]);
  }
  for (const file of readdirSync(join(CLAUDE, "hooks")).filter((f) => f.endsWith(".mjs"))) {
    assert.ok(registered.has(file) || imported.has(file), `${file} is neither registered nor imported by a registered hook`);
  }
});

test("every PreToolUse guard fails closed", () => {
  assert.ok(guards.length >= 7, `expected at least 7 PreToolUse guards, found ${guards.length}`);
  for (const g of guards) assert.equal(g.onFailure, "block", g.command);
});

test("the matchers are valid and cover the tools they guard", () => {
  const groups = settings.hooks.PreToolUse.map((g) => new RegExp(g.matcher));
  const bash = groups.find((r) => r.test("Bash"));
  const writes = groups.find((r) => r.test("Write"));
  assert.ok(bash && writes, "a Bash group and a Write group");
  for (const tool of ["Write", "Edit", "NotebookEdit"]) assert.ok(writes.test(tool), `${tool} is guarded`);
  for (const tool of ["Bash", "Read", "Grep", "WriteSomething", "MultiEdit"]) {
    assert.equal(writes.test(tool), false, `${tool} must not match the Write group`);
  }
  assert.equal(bash.test("NotebookEdit"), false);
});

test("the deny rules keep dotenv files and secrets unreadable", () => {
  const deny = settings.permissions?.deny ?? [];
  for (const rule of ["Read(./.env)", "Read(./.env.*)", "Read(./secrets/**)"]) assert.ok(deny.includes(rule), rule);
});

test("enabledPlugins entries are name@marketplace booleans", () => {
  for (const [id, on] of Object.entries(settings.enabledPlugins ?? {})) {
    assert.match(id, /^[a-z0-9-]+@[a-z0-9-]+$/, id);
    assert.equal(typeof on, "boolean", id);
  }
});

// Run a registered guard as Claude Code would: payload on stdin, in a given directory.
const GUARD_FILES = [...new Set(guards.map((g) => hookFile(g.command)))];
const run = (file, payload, cwd = CLAUDE) =>
  spawnSync("node", [join(CLAUDE, "hooks", file)], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    cwd,
    env: { ...process.env, CLAUDE_PROJECT_DIR: join(CLAUDE, "..") },
  }).status;

test("a guard does not crash on a malformed payload", () => {
  const malformed = [
    "", "not json", "null", "[]", "{}", '"str"', "42", "true", '{"tool_input":null}', '{"tool_input":"x"}',
    '{"tool_input":{"file_path":42,"command":7,"content":{},"new_string":[],"notebook_path":{}}}',
    '{"agent_type":42,"tool_input":{"command":{}}}', '{"cwd":42,"tool_input":{"command":"ls"}}',
  ];
  for (const file of GUARD_FILES) {
    for (const payload of malformed) assert.equal(run(file, payload), 0, `${file} on ${payload}`);
  }
});

// A throwaway repository on `main`, so the branch guards have something to refuse.
function withMainRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), "settings-test-"));
  try {
    const git = (...args) =>
      spawnSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: dir });
    git("init", "-q", "-b", "main");
    mkdirSync(join(dir, "scripts"));
    writeFileSync(join(dir, "scripts", "a.mjs"), "x\n");
    git("add", "-A");
    git("commit", "-q", "-m", "init");
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("each guard answers a harmless call with 0 and still blocks what it exists to block", () => {
  withMainRepo((repo) => {
    const bash = (command, extra = {}) => ({ tool_name: "Bash", tool_input: { command }, cwd: repo, ...extra });
    const write = (path, content = "x") => ({ tool_name: "Write", tool_input: { file_path: path, content }, cwd: repo });
    // The CommonJS fixture is assembled at runtime, or this very file would trip the guard it tests.
    const commonjs = ["const a = req", 'uire("fs")'].join("");
    const cases = [
      // [guard, a harmless payload, a payload it must block]
      ["guard-readonly-bash.mjs", bash("git status", { agent_type: "code-reviewer" }), bash("rm -rf x", { agent_type: "code-reviewer" })],
      ["guard-bash-writes.mjs", bash("ls"), bash("cat .env")],
      ["guard-bash-writes.mjs", bash("ls"), bash("touch scripts/x")],
      ["guard-double-background.mjs", bash("ls"), { tool_name: "Bash", tool_input: { command: "nohup x &", run_in_background: true } }],
      ["guard-secret-writes.mjs", write(join(repo, "README.md")), write(join(repo, ".env"), "A=1")],
      ["guard-no-commonjs.mjs", write(join(repo, "scripts", "b.mjs"), "export {}"), write(join(repo, "scripts", "b.mjs"), commonjs)],
      ["guard-branch-isolation.mjs", write(join(repo, "README.md")), write(join(repo, "scripts", "b.mjs"))],
    ];
    for (const [file, ok, bad] of cases) {
      assert.ok(GUARD_FILES.includes(file), `${file} is registered`);
      assert.equal(run(file, ok, repo), 0, `${file} on a harmless call`);
      assert.equal(run(file, bad, repo), 2, `${file} on ${JSON.stringify(bad.tool_input)}`);
    }
    // guard-git-push-signed only reads the command; a harmless one passes
    assert.equal(run("guard-git-push-signed.mjs", bash("git status"), repo), 0);
  });
});
