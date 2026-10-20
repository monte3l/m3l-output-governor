---
paths:
  - "tests/**"
  - "**/*.test.mjs"
---

# Testing rules (`tests/**`, `*.test.mjs`)

> This file is the terse checklist that auto-loads when you edit a test.

## This repo

- **Use `node:test` and `node:assert/strict`.** No test framework dependency.
- **Synthetic transcripts only, never real session data.** Build the JSONL in
  the test; a real transcript leaks prompts and paths into git.
- **Offline and cheap.** No network, and never spawn a live eval
  (`evals/p4.mjs --live` spends money). Exercise the dry run only.
- **Strip `NODE_TEST_CONTEXT` when a test spawns `node --test`.** A nested run
  inherits it and reports success whatever happened (see `tests/evals.test.mjs`).
- **An output-shape change keeps the planted-secret counts-only test passing**
  in `tests/measure.test.mjs`, and it must still fail if the output starts
  echoing prompt text, tool output or paths.
- **Run one file with `node --test tests/<file>.test.mjs`.** The full run is
  `node --test "tests/*.test.mjs"`; a bare `tests/` directory fails on Node 24.

## General

- **Assert the named behavior, not a proxy** — not `length > 0`, and not merely
  that the call "doesn't throw". If a positive and a negative claim are both met
  by nothing happening, assert the positive one explicitly.
- **A test that claims to guard something must be mutation-tested** — delete the
  guard clause, invert the flag, drop the de-duplication, and confirm the test
  fails. Verify the mutation actually changed the file before trusting a
  "survivor"; an equivalent mutant needs a note, not a new test.
- **A guard can go vacuous later.** When a change adds a consumer of a signal a
  test observes indirectly, re-mutate the tests watching it.
- **A check whose two sides come from one source can never fail** — a fixture
  that echoes the value under test passes either way. Pin one side by hand.
- **A test naming an "every X", ordering or precedence guarantee must make every
  arm reachable in its own setup.** Enumerate the set, not one member.
- **Never mock the behavior the test exists to validate.** Exercise the real
  collaborator at least once.
- **Real filesystem only inside a per-test `mkdtemp` sandbox**, removed in the
  same test.
- **Never make a test wait by counting event-loop turns** or sleeping; anchor on
  a structural guarantee.
- **Thread `now` or a home directory as a parameter** instead of reading the
  clock or `homedir()` inside the unit (`projectDir(cwd, home)` is the model).
- **Fail loud.** Prefer a specific `assert.throws`/`assert.equal` over a catch
  that lets the test pass on error.
- **Assemble a secret-shaped fixture at runtime**, never as one source literal,
  if a secret scanner runs over the source.
- **Test-first.** Write the test from the documented contract, watch it fail for
  the right reason, then implement; don't backfill a mirror of existing code.
- **A gate failing outside your change's blast radius is presumed pre-existing**
  until `git diff origin/main -- <path>` says otherwise. A flaky green re-run is
  a flake to diagnose, not a pass.
- **A failure while other work is running may be contention** — re-run alone
  first.
