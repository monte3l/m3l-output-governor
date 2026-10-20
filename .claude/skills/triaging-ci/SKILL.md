---
name: triaging-ci
description: >-
  Diagnose a CI failure via gh CLI: resolve the failing run, fetch logs, map the
  failure to its workflow and job, report root cause plus the exact local repro
  command, and present 3-5 fix options. Use for /triaging-ci, "why did CI fail",
  "CI is failing", "the build is red", "find the root cause of a failing
  build", "debug the CI run", or a specific run ID/URL. GitHub stance: gh CLI.
---

Diagnose why a GitHub Actions run failed by fetching its logs via `gh` and
mapping the failure to the workflow, job and root cause, then present 3–5
options. This skill does not apply fixes; it ends with options, not actions.

## Steps

### 1 — Resolve the run

If the user gave a run ID or URL, extract the numeric ID. Otherwise find the
most recent failed run on the current branch:

```bash
gh run list --branch $(git rev-parse --abbrev-ref HEAD) \
  --limit 5 \
  --json databaseId,status,conclusion,name,createdAt
```

Pick the most recent entry whose `conclusion` is `"failure"`. If none, widen
to the 10 most recent runs across all branches:

```bash
gh run list --limit 10 \
  --json databaseId,status,conclusion,name,headBranch,createdAt
```

Proceed with a failed run found there and note its branch. If none exists,
say so and stop.

**Zero runs at all for a pushed SHA is a different problem**: a dropped
webhook event, not a code failure. Check whether an unrelated PR pushed at
the same time shows the same gap; if so, an empty-commit push
(`git commit -s --allow-empty -m "chore: retrigger ci"`) is a safe fix.

### 2 — Fetch the failing job logs

```bash
gh run view <id> --log-failed
```

If that returns nothing (cancelled run, or a post-step failure), use
`gh run view <id> --log`. Keep only the region around the first failure,
typically the last 50–100 lines before the abort.

### 3 — Map to the workflow and job

Match the failing workflow and job, then reproduce locally:

| Workflow / job | Local repro |
| --- | --- |
| `verify.yml` / `checks` | `node --test "tests/*.test.mjs"` and `node design/source/docs-kit/build.mjs --check` |
| `verify.yml` / `plugin` | `npm ci --prefix .github/ci-tools`, put `.github/ci-tools/node_modules/.bin` first on `PATH`, then `claude plugin validate --strict .` |
| `verify.yml` / `dco` | `git log --format='%h %an <%ae> %(trailers:key=Signed-off-by)' origin/main..HEAD`; fix with `git commit --amend -s` or `git rebase --signoff origin/main` |
| `verify.yml` / `verify` | Aggregate job; it fails when a lane above failed, so triage that lane |
| `reuse.yml` | `reuse lint` |
| `workflow-lint.yml` | `actionlint` and `zizmor .github/workflows` |
| `docs.yml`, `docs-live.yml` | `node design/source/docs-kit/build.mjs --check`; for the live check, see the workflow log |
| `gitleaks.yml`, `dependency-review.yml`, `scorecard.yml` | No local repro; read the log for the flagged secret, dependency or check |

Only `verify` is documented as a required check. The docs-parity failures
name what drifted (README or `evals/results.md` versus code and committed
runs): fix the page, never the vendored kit. If the failing step is not in
the table, read the workflow file for its command.

### 4 — Report the diagnosis

```
## CI Triage — Run #<id>

**Failed job:** <workflow / job / step>
**Reproduce locally:** <exact command>
**Root cause:** <one sentence>
**Error excerpt:**
<quoted lines, enough to identify the file/rule/test>
**Assessment:** <Real failure | Likely flake — explain why>
```

A likely flake is a transient runner issue: network timeout during
`npm ci`, a GitHub-side runner error, or a retry that would probably pass.
Everything else is a real failure.

### 5 — Present solution options

In a separate `## Solution Options` section, give 3–5 options. Each has a
one-line description, the exact command or change, and the main tradeoff. Do
not apply any fix.

If triaging several runs, write the per-run reports to a file and keep the
chat reply to a short summary table.
