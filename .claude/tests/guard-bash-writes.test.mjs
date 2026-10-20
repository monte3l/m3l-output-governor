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

test("a secret named inside a substitution, a wrapper string or code is refused", () => {
  withRepo("feat/x", (dir) => {
    // assembled at runtime, or this file would trip the no-CommonJS guard it sits beside
    const read = ["req", "uire('fs').readFileSync('.env')"].join("");
    for (const command of [
      "echo $(cat .env)", 'echo "$(cat .env)"', "echo `cat .env`", "echo $(<.env)", "echo ok; echo $(cat .env)",
      "cat $(echo .env)", "cat $(printf .env)", "echo $(echo .env)",
      "sh -c 'cat .env'", 'bash -c "cat ./.env.local"', "eval 'cat .env'", "eval cat .env", "env cat .env", "xargs cat < .env",
      "ssh host 'cat .env'", "python3 -c \"print(open('.env').read())\"", "perl -e 'print <.env>'", `node -e "${read}"`,
      "awk 1 .env", "bash <<'EOF'\ncat .env\nEOF", "python3 - <<'EOF'\nopen('.env').read()\nEOF",
    ]) {
      assert.equal(status(command, dir), 2, command);
    }
  });
});

test("a glob inside a wrapper string or a shell heredoc is expanded, and an unreadable cd is judged", () => {
  withRepo("feat/x", (dir) => {
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "sub", ".env"), "x");
    for (const command of ["sh -c 'cat sub/.e*'", "bash <<'EOF'\ncat sub/.en?\nEOF", "cd sub && sh -c 'cat .e*'"]) {
      assert.equal(status(command, dir), 2, command);
    }
    assert.equal(status("cd ~ && ls", dir), 0, "no glob, nothing to expand");
    assert.equal(status("cd docs && ls *", dir), 0, "a readable cd into a clean directory");
    // after a cd the guard cannot follow, a glob whose pattern could match a secret name is refused
    for (const command of ["cd $X && cat cred*", "cd ~ && cat id_*", "cd - && cat sec*", "cd ~ && cat .e*", "cd ~ && cat *.pem"]) {
      assert.equal(status(command, dir), 2, command);
    }
    // a leading dot is never matched by `*`, so `*env` cannot reach `.env`
    assert.equal(status("cd ~ && cat *env", dir), 0, "a pattern that cannot match a dotfile");
    // After a cd the guard cannot follow, a glob is judged by its pattern: it cannot match a
    // secrets path unless the names it could produce include one.
    for (const command of [
      "cd $HOME && node --test tests/*.test.mjs", "cd ~ && cat *.md", "cd - && ls scripts/*.mjs", "cd $X && wc -l docs/*.txt",
      "cd ~ && for f in a/*.mjs; do node --check $f; done",
    ]) {
      assert.equal(status(command, dir), 0, command);
    }
  });
});

test("a heredoc is code only when a shell or interpreter shares the line with its marker", () => {
  withRepo("feat/x", (dir) => {
    // the heredoc feeds cat or git, so its body is data, even though python3 runs later on
    for (const command of [
      "cat > notes.txt <<'EOF'\nthe .env file and secrets\nEOF\npython3 -c \"print(1)\"",
      "git commit -F - <<'EOF'\nmentions .env and secrets/key\nEOF\nsh -c 'echo done'",
      "cat <<'EOF' > notes.txt\nsee .env\nEOF\nnode --test",
    ]) {
      assert.equal(status(command, dir), 0, command);
    }
    // an interpreter on the marker's line, or a pipe into one, makes the body its program
    for (const command of [
      "python3 - <<'EOF'\nopen('.env').read()\nEOF",
      "cat <<'EOF' | bash\ncat .env\nEOF",
      "bash <<'EOF'\ncat secrets/key\nEOF",
      "cat <<'EOF' | python3\nopen('.env')\nEOF",
    ]) {
      assert.equal(status(command, dir), 2, command);
    }
  });
});

test("code that only mentions a secret by name, not by path, is allowed", () => {
  withRepo("feat/x", (dir) => {
    for (const command of [
      "echo $(pwd)", 'echo "$(git rev-parse --show-toplevel)"', 'git commit -m "fix secrets handling"', "sh -c 'echo hi'",
      'python3 -c "print(1)"', "python3 - <<'EOF'\nprint('the secrets module and credentials')\nEOF",
      "bash <<'EOF'\necho hello\nEOF", "node --test", "git log --oneline | head",
    ]) {
      assert.equal(status(command, dir), 0, command);
    }
  });
});

test("a recursive glob and a glob after a cd are expanded for the secrets check", () => {
  withRepo("feat/x", (dir) => {
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "sub", ".env"), "x");
    for (const command of ["cat **/.env", "cat **/.env*", "cd sub && cat .e*", "cd sub; cat .en?"]) {
      assert.equal(status(command, dir), 2, command);
    }
    for (const command of ["cd docs && cat .e*", "cat **/*.md", "cd docs; ls"]) {
      assert.equal(status(command, dir), 0, command);
    }
  });
});

test("on main, a guarded directory named through a glob, a variable or a wrapper is refused", () => {
  withRepo("main", (dir) => {
    for (const command of [
      "touch scr*/measure.mjs", "touch s[c]ripts/measure.mjs", "rm te?ts/a.test.mjs", "D=scripts; touch $D/x", "touch $(echo scripts)/x",
      "sh -c 'touch scripts/x'", 'bash -c "echo x > tests/a"', 'eval "rm scripts/measure.mjs"', "python3 -c \"open('scripts/x','w')\"",
      "bash <<'EOF'\ntouch scripts/x\nEOF", "cd scr* && touch x",
    ]) {
      assert.equal(status(command, dir), 2, command);
    }
    for (const command of ["echo $(pwd)", "git log --oneline | head", "git switch -c feat/x", "touch README.md", "echo $(git rev-parse --show-toplevel)"]) {
      assert.equal(status(command, dir), 0, command);
    }
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
