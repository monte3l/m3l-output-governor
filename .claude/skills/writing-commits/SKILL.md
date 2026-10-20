---
name: writing-commits
description: >-
  Inspect the staged diff, select the Conventional Commit type, draft an
  imperative subject ≤70 chars, decide whether a body is needed, write it as
  prose, add Co-Authored-By when AI-assisted, then commit signed off and
  signed. Use for "commit this", "write a commit", "stage and commit".
---

# writing-commits

This skill produces git commits that match this repository's Conventional
Commits standard, from picking the type to deciding whether a body is worth
writing. Every commit should be self-explanatory to a reviewer who was not in
the room.

## Checklist

- [ ] Read `git diff --staged` and understand every changed file
- [ ] Pick the type from the table in Step 2
- [ ] Draft a subject ≤ 70 chars, imperative, lowercase after `type:`
- [ ] Decide on a body: needed for `feat:`, `fix:` and non-obvious changes
- [ ] Add the `Co-Authored-By:` trailer when Claude authored the commit
- [ ] Confirm `git config commit.gpgsign` prints `true`, then `git commit -s`

## Step 1 — Understand the change

```bash
git diff --staged             # the files about to be committed
git diff                      # unstaged context (reference only)
git log main..HEAD --oneline  # commits already on this branch
```

The staged diff is the source of truth; the log prevents duplicate subjects.

## Step 2 — Select the commit type

| Type        | Use when                                                         |
| ----------- | ---------------------------------------------------------------- |
| `feat:`     | New behaviour: a flag, an output field, a skill, an eval         |
| `fix:`      | A bug in `scripts/`, `evals/` or the plugin is corrected         |
| `test:`     | Tests only, no behaviour change                                  |
| `docs:`     | README, CONTRIBUTING, UNVERIFIED.md, `evals/results.md`, CHANGELOG |
| `ci:`       | GitHub Actions workflows and `.github/ci-tools/` only            |
| `chore:`    | Tooling, config, `.claude/`, vendored `design/` syncs            |
| `refactor:` | Internal restructuring with no behaviour change                  |

**Scope** in parentheses is welcome when it names the area, as in the
history: `design`, `plugin`, `docs`. Omit it when nothing needs
disambiguating. Mark a breaking change to a flag or output field with `!` and
a `BREAKING CHANGE:` footer.

## Step 3 — Draft the subject line

- **Imperative present tense**: "add", "fix", not "added"
- **Lowercase** after `type:`, no trailing period
- **≤ 70 characters**
- **Specific**: name the script, flag, field or file

## Step 4 — Decide whether a body is needed

**Include a body** for `feat:` and `fix:`, for changes to hooks, `.claude/`
or workflows, and for any `chore:` or `ci:` whose reason is not obvious.

**Omit it** for mechanical changes (a formatting run, a one-line CI tweak)
where the subject already says everything.

## Step 5 — Write the body

Write one or two short prose paragraphs, not a bullet list: first what
changed, then why it was needed and any constraint a reviewer could not infer
from the diff. Do not add a semver line.

End with the provenance trailer, using the exact model name your session
reports (the session's own system reminder gives the line):

```
Co-Authored-By: Claude <model name> <noreply@anthropic.com>
```

Never add a `Claude-Session:` or any other `Claude-*` trailer.
`Co-Authored-By:` is the only Claude trailer allowed here.

## Step 6 — Run the commit

Every commit needs a `Signed-off-by:` trailer (DCO, checked by CI) and a
cryptographic signature (the `main` ruleset rejects unsigned commits). `-s`
adds the first; the second comes from git config.

```bash
git config commit.gpgsign    # must print "true"; if not, stop and tell the user
git commit -s -m "$(cat <<'EOF2'
<type>(<scope>): <subject>

<body, omitted when not needed>

Co-Authored-By: Claude <model name> <noreply@anthropic.com>
EOF2
)"
```

If `commit.gpgsign` is not `true`, do not commit: an unsigned commit will be
rejected at merge and has to be rewritten.

## Examples

Bad: `Fixed the thing in measure` (past tense, no type, vague).

Good, subject only (mechanical):

```
chore(design): sync m3l-design v1.4.0
```

Good, with a body:

```
fix(plugin): match the marketplace entry's description to plugin.json

claude plugin validate --strict compares the two strings, so a drifted
marketplace description failed the plugin lane even though the manifest
itself was valid. The marketplace entry now carries the same text.

Co-Authored-By: Claude <model name> <noreply@anthropic.com>
```
