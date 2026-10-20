// Tests for .claude/hooks/guard-bash-writes.mjs: the Bash side of the secret-write
// and branch-isolation guards. Run: node --test .claude/tests/guard-bash-writes.test.mjs
// Each case runs the real hook against a throwaway git repository.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { namesGuardedPath } from "../hooks/guard-bash-writes.mjs";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "../hooks/guard-bash-writes.mjs");

const git = (cwd, ...args) =>
  spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
  });

/** A repository on `branch` with the guarded directories and a few files in it. */
function makeRepo(branch = "main") {
  const dir = mkdtempSync(join(tmpdir(), "guard-bash-"));
  git(dir, "init", "-q", "-b", "main");
  for (const d of ["scripts", "tests", "evals", "skills", ".claude-plugin", "docs"]) mkdirSync(join(dir, d));
  for (const f of ["README.md", "scripts/measure.mjs", "tests/a.test.mjs", ".env.example"]) writeFileSync(join(dir, f), "x\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "init");
  if (branch !== "main") git(dir, "switch", "-q", "-c", branch);
  return dir;
}

function withRepo(branch, fn) {
  const dir = makeRepo(branch);
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const status = (command, cwd) =>
  spawnSync("node", [HOOK], { input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd }), encoding: "utf8" }).status;

// Secret-shaped fixtures are assembled at runtime, never written as one literal.
const AWS_ID = "AKIA" + "IOSFODNN7EXAMPLE";
const PAT = ["ghp", "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"].join("_");

test("naming a secrets path is refused, on any branch", () => {
  withRepo("feat/x", (dir) => {
    for (const command of [
      "cat .env", "cat ./.env.local", "echo KEY=v > .env", "echo hi >> .env.production", "printf x > key.pem", "tee .env",
      "cp .env.example .env", "sed -i s/a/b/ .env", "git add .env", "grep x .env", "head -1 secrets/key", "cat ~/.ssh/id_rsa",
      "cat <.env", "cat 0<.env", "git show HEAD:.env", "grep -f.env x",
    ]) {
      assert.equal(status(command, dir), 2, command);
    }
  });
});

test("a glob that matches a secrets path is refused where it expands", () => {
  withRepo("feat/x", (dir) => {
    for (const f of [".env", "id_rsa", "key.pem"]) writeFileSync(join(dir, f), "x");
    for (const command of ["cat .e*", "cat .en?", "cat id_*", "cat *.pem", "cat ./.e*"]) {
      assert.equal(status(command, dir), 2, command);
    }
    assert.equal(status("cat README.m?", dir), 0, "a glob that matches no secret");
  });
});

test("a secret literal in a command is refused", () => {
  withRepo("feat/x", (dir) => {
    assert.equal(status(`echo ${AWS_ID} > notes.txt`, dir), 2, "an AWS key id");
    assert.equal(status(`curl -H "Authorization: Bearer ${PAT}" https://example.com`, dir), 2, "a GitHub token");
    assert.equal(status("echo hello > notes.txt", dir), 0);
  });
});

test("a command that only prints or tests a secrets path is not a use of it", () => {
  withRepo("feat/x", (dir) => {
    for (const command of [
      'echo ".env" >> .gitignore', "printf '%s\\n' .env", "ls .env", "[ -f .env ] && echo yes", "test -f .env", "stat .env",
      "cat .env.example", "git diff -- .env.example", "git status", "grep -n env .gitignore", "git add README.md", "cp a b",
      "rm -rf node_modules", "ls", "cat README.md", "echo hi > out.txt",
    ]) {
      assert.equal(status(command, dir), 0, command);
    }
  });
});

test("a heredoc body is data: prose in it is not a use of a secrets path, a literal secret is", () => {
  withRepo("feat/x", (dir) => {
    const body = (text) => `git commit -F - <<'EOF'\n${text}\nEOF`;
    assert.equal(status(body("names no secrets path and never touches .env"), dir), 0, "prose that says secrets and .env");
    assert.equal(status(body(`the key was ${AWS_ID}`), dir), 2, "a literal secret in the body");
    assert.equal(status("cat <<'EOF'\nnotes about secrets\nEOF", dir), 0);
    // a real command after the terminator is still judged
    assert.equal(status(`${body("ok")}\ncat .env`, dir), 2, "a command after the body");
    // a fake marker inside quotes hides nothing
    assert.equal(status("echo '<<EOF'\ncat .env\nEOF", dir), 2, "a marker inside quotes");
    assert.equal(status("echo $((1<<EOF))\ncat .env\nEOF", dir), 2, "a marker inside arithmetic");
  });
});

test("on main, a write that names a guarded directory is refused", () => {
  withRepo("main", (dir) => {
    for (const command of [
      "touch scripts/x", "sed -i s/a/b/ scripts/measure.mjs", "echo x > tests/a.test.mjs", "mkdir evals/new", "rm skills/measure/SKILL.md",
      "cp a .claude-plugin/b", "git add scripts/x", "python scripts/x.py", "cd scripts && touch x", "touch SCRIPTS/x", "mv a tests/b", "echo x >> Tests/a.test.mjs",
      // a glued redirect is one word, `>tests/a`, so only the redirect target names the path
      "echo x >tests/a.test.mjs", "echo x>scripts/y", "echo x >>evals/z", "echo x 2>skills/e",
    ]) {
      assert.equal(status(command, dir), 2, command);
    }
  });
});

test("on main, a write from inside a guarded directory is refused", () => {
  withRepo("main", (dir) => {
    assert.equal(status("touch x", join(dir, "scripts")), 2, "cwd inside scripts/");
    assert.equal(status("touch x", join(dir, "docs")), 0, "cwd inside an unguarded directory");
    assert.equal(status("touch x", dir), 0, "cwd at the root, naming nothing guarded");
  });
});

test("on main, reads, branch switches and writes elsewhere are allowed", () => {
  withRepo("main", (dir) => {
    for (const command of [
      "git switch -c feat/x", "git status", "ls scripts", "cat scripts/measure.mjs", "node --test", "git log -- scripts",
      "grep -rn x scripts", "touch README.md", "echo hi > README.md", "mkdir docs/new", "git diff -- tests",
    ]) {
      assert.equal(status(command, dir), 0, command);
    }
  });
});

test("off main the same writes are allowed", () => {
  withRepo("feat/x", (dir) => {
    for (const command of ["touch scripts/x", "sed -i s/a/b/ scripts/measure.mjs", "echo x > tests/a.test.mjs", "mkdir evals/new"]) {
      assert.equal(status(command, dir), 0, command);
    }
  });
});

test("detached on the main commit counts as main", () => {
  withRepo("main", (dir) => {
    git(dir, "checkout", "-q", "--detach");
    assert.equal(status("touch scripts/x", dir), 2);
  });
});

test("outside a git repository nothing is refused for the branch", () => {
  const dir = mkdtempSync(join(tmpdir(), "guard-nogit-"));
  try {
    assert.equal(status("touch scripts/x", dir), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("namesGuardedPath matches any segment, in any case", () => {
  for (const word of ["scripts", "scripts/x", "./tests/a", "a/evals/b", "Skills/x", ".claude-plugin/plugin.json", "/abs/scripts/x"]) {
    assert.equal(namesGuardedPath(word), true, word);
  }
  for (const word of ["README.md", "docs/x", "script", "testsuite/x", ".claude/rules/a.md", "fix scripts/x"]) {
    assert.equal(namesGuardedPath(word), false, word);
  }
});
