---
name: creating-prs
description: >-
  Verify quality gates, push the branch, open a PR with a Conventional Commit
  title and the repo's PR template body, then report its URL and check status.
  Use for /creating-prs, "open a PR", "create a pull request", "ship this for
  review", or after finishing a fix. Requires gh CLI auth.
---

# creating-prs

Takes a branch with committed work from "ready" to "opened and gated". Every
change to `main` goes through a PR, and a PR merges only with the `verify`
check green and a code-owner approval from someone other than the author, so
this skill opens the PR and stops. Assumes `starting-work` already put you on
the right branch.

## Steps

### 1 — Preflight

Confirm you are not on `main` and `git status --porcelain` is empty (or
everything is intentionally staged). Confirm every commit is signed off and
signed: `git log origin/main..HEAD --format='%h %G? %(trailers:key=Signed-off-by)'`
shows `G` and a trailer on each non-merge commit. A missing sign-off fails the
`dco` job; an unsigned commit is rejected by the `main` ruleset.

### 2 — Resync with `origin/main`

The ruleset requires an up-to-date branch.

```bash
git fetch origin
git rebase origin/main
```

### 3 — Run the quality gate

These are the commands CI's `verify` runs:

```bash
node --test "tests/*.test.mjs"          # a bare tests/ directory fails on Node 24
claude plugin validate --strict .
node design/source/docs-kit/build.mjs --check
command -v reuse >/dev/null && reuse lint   # only if reuse is installed
```

CI uses the Claude Code version pinned in `.github/ci-tools/`
(`npm ci --prefix .github/ci-tools`, then put its `node_modules/.bin` first on
`PATH`); a different local version can disagree with CI. Fix everything
before pushing. If the change touched a flag, default, output field or
quoted number, confirm the README, `evals/results.md` or `UNVERIFIED.md`
changed in the same branch.

### 4 — Pre-push review (optional)

For a non-trivial diff, offer a `code-reviewer` pass over the diff (and
`silent-failure-hunter` if it has error-handling paths). Fix Must-fix items
before pushing.

### 5 — Push

```bash
git push -u origin <branch>
```

The `guard-git-push-signed` hook blocks pushing unsigned commits. Never
`--force` a shared branch; after a rebase use `--force-with-lease`.

### 6 — Title and body

Read `git log origin/main..HEAD --oneline`. The title is a Conventional
Commit summarizing the PR as a whole: `<type>(<scope>): <subject>`,
imperative, lowercase, ≤ 70 chars.

Read `.github/pull_request_template.md` and fill it in: the "What and why"
section in prose, and tick only the checklist items you actually verified.
End the body with the attribution line from the session's system reminder.

### 7 — Submit

```bash
gh pr create --title "<title>" --body "$(cat <<'EOF2'
<body>
EOF2
)"
```

### 8 — Report

```bash
gh pr view --json url,mergeable,mergeStateStatus
gh pr checks
```

If `mergeable` is `CONFLICTING`, resolve it. Report the PR URL and the check
status to the user, and say it needs a code-owner approval from someone other
than the author. Do **not** merge and do **not** enable auto-merge unless the
user explicitly asks; if they do, PRs here land as merge commits
(`gh pr merge --merge`), never squash. After it merges, `finishing-work`
takes over. On a red check, use `triaging-ci`.

## Notes

- Use the `gh` CLI for every GitHub operation, not the raw REST API.
- Open an issue first for anything beyond a small fix (see `CONTRIBUTING.md`).
