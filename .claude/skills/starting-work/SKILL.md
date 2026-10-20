---
name: starting-work
description: >-
  The pre-work decision gate for any task that will change code. Invoke it
  FIRST -- before reading, investigating, or editing anything -- for
  "implement", "build", "add", "fix the bug where ...", "refactor", or any
  request to change behavior, even when the change is unnamed or you have not
  seen the code yet. Inspects git state, recommends a branch (feat/fix/ci/
  chore/docs <slug>) and push target, and confirms them before any write.
  Skip for research and questions that change nothing.
---

# starting-work

This skill is the single place the repository answers "where do I do this
work?" before touching anything. Every change to `main` goes through a PR, so
every task needs a branch. `guard-branch-isolation` hard-blocks writes to
`scripts/`, `evals/`, `tests/`, `skills/` and `.claude-plugin/` while `HEAD`
is `main`. That is a backstop, not a plan: this skill branches _before_ the
block can fire.

## The contract

**Infer and recommend all decisions, then confirm every one with the user in
a single round. Do not write files or create a branch until the user has
confirmed.** The user can override any recommendation.

## Steps

### 1 — Inspect git state (read-only)

```bash
git rev-parse --abbrev-ref HEAD      # branch name; "HEAD" means detached
git status --porcelain               # is the tree already dirty?
```

- A detached HEAD on the `main` commit counts as `main`.
- **Re-run this after any conversational gap**; the branch is not a stable
  fact across a long session.

### 2 — Infer the change scope

Work out which paths will be edited. The guarded paths are `scripts/`,
`evals/`, `tests/`, `skills/` and `.claude-plugin/`. `design/source/`,
`design/tokens.css` and `design/SHA256SUMS` are a vendored copy and are never
hand-edited: a design change is a `bin/sync-design.sh` run from `m3l-design`.
Docs, `.github/` and `.claude/` changes are not guarded but still need a PR.

### 3 — Recommend each decision

- **Branch**: pick the prefix from the kind of change, with a short
  kebab-case slug.

  | Prefix | For |
  | --- | --- |
  | `feat/<slug>` | New behaviour |
  | `fix/<slug>` | Bug fix |
  | `ci/<slug>` | Workflows, `.github/ci-tools/` |
  | `chore/<slug>` | Tooling, config, `.claude/`, design sync |
  | `docs/<slug>` | Documentation only |

  If already on a suitable non-`main` branch, recommend staying. Never
  recommend `main` or a detached-on-`main` HEAD.
- **PR required?**: always yes. Never commit directly to `main`.
- **Issue first?**: for anything beyond a small fix, `CONTRIBUTING.md` asks
  for an issue before the work.
- **Push target**: `origin <the recommended branch>`, never `origin main`.

### 4 — Confirm with the user (blocking)

Ask every open decision in **one** `AskUserQuestion` call, one question per
decision, your recommendation first and labelled "(Recommended)". For the
branch, offer the inferred name plus an "Other" path. Say explicitly that
nothing is written and no branch is created until they confirm. Skip any
dimension the user already settled (e.g. "do it on `fix/foo`").

### 5 — Act on the confirmed decisions

```bash
git switch -c <prefix>/<slug>
```

Verify `HEAD` is neither `main` nor detached-on-`main` before handing back; if
it is, return to Step 4. When **resuming an existing branch**, resync it with
`origin/main` first (the ruleset requires an up-to-date branch).

### 6 — Hand back

Report one line: branch, PR (yes), push target.
