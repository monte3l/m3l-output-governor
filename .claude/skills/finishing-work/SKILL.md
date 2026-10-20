---
name: finishing-work
description: >-
  Runs the post-merge close-out tail creating-prs doesn't: verifies the PR
  actually merged, returns to main and pulls, deletes the merged local
  branches, and prunes stale remote refs. Use for /finishing-work, "clean up
  after this PR", "the PR merged, wrap this up", "delete the merged
  branches", "prune stale remote refs", or when a merged branch or stale refs
  linger -- even when it sounds like a one-line git command, because deleting
  a branch that never merged loses work and this skill checks first. GitHub
  stance: gh CLI.
---

# finishing-work

`creating-prs` stops at an open PR, and nothing else checks whether it
merged or cleans up afterward. This skill is that owner. PRs here land as
merge commits, so a merged branch's commits are ancestors of `main` and
`git branch -d` works without force.

## Steps

### 1 — Confirm the PR actually merged

```bash
gh pr view --json state,mergedAt,headRefName,baseRefName
```

- `state: "MERGED"` with a non-null `mergedAt`: proceed.
- `state: "OPEN"`: stop. It still needs checks and a code-owner approval; the
  merge is not done.
- `state: "CLOSED"` with null `mergedAt`: stop. Closed without merging; ask
  whether the branch should still be cleaned up.

Record `headRefName`; every later step operates on that branch.

### 2 — Check for a linked worktree

```bash
git worktree list --porcelain
```

If a worktree has `headRefName` checked out and this session entered it with
`EnterWorktree`, use `ExitWorktree` (keep, don't remove) first, because
`git checkout main` fails while `main` is checked out in another worktree.
Then run `git config core.bare`; if it prints `true`, run
`git config --local core.bare false` (known Claude Code worktree bug). Plain
`git worktree add` checkouts: just `cd` back to the main checkout.

### 3 — Return to `main` and pull

```bash
git checkout main
git pull --ff-only
```

### 4 — Delete the merged branch

First make sure no backgrounded command (a push, a check run) is still
running against the branch. Then confirm nothing on it is unmerged:

```bash
git log <headRefName> ^origin/main --oneline
```

A non-empty result is a commit about to be abandoned; stop and ask.

If Step 2 found a linked worktree, remove it before the branch (git refuses
to delete a checked-out branch). Confirm with the user before `remove` or
`unlock`, since gitignored files exist only in that worktree:

```bash
git -C <worktree-path> status --porcelain   # must be empty
git worktree remove <worktree-path>         # confirm first
git worktree prune
```

Then delete the branch:

```bash
git branch -d <headRefName>
```

If `git branch -d` refuses, the branch is not merged into `main`. Never
force-delete it with `-D`: report why and ask the user. Never delete an
unmerged branch.

### 5 — Prune and sweep other merged branches

```bash
git fetch --prune
git branch --merged main
```

Delete other local branches listed by `--merged` (except `main`) with
`git branch -d`, after showing the user the list. Leave anything not listed.

### 6 — Report

One line: worktree removed (if any), branches deleted (or kept, with why),
refs pruned.

## Notes

Every destructive step asks first. A cautious tail beats none.
