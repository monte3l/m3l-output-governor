---
paths:
  - "scripts/**"
  - "evals/**"
  - "tests/**"
---

# Refactoring rules (scripts, evals & tests)

> This file is the terse checklist that auto-loads when you change existing code.

Refactoring changes internal structure **without changing observable behavior**.
It is not feature, performance, or behavior work — those are separate commits.

- **Test safety net first.** A passing `node --test "tests/*.test.mjs"` must
  exist before you refactor; if the area lacks tests, **add characterization
  tests** capturing current behavior first.
- **State the goal.** Name the problem you are removing (duplication,
  complexity, naming). No identified problem → no refactor.
- **Small isolated steps**, each one focused operation, **committed individually**
  with a `refactor:` commit. Rerun the tests after each step; a failure is a
  regression — revert before continuing.
- **Opportunistic / Boy-Scout:** leave touched code better than you found it, and
  do a preparatory refactor first when it makes the change you came to do
  simpler — but **keep it bounded** and in its own commit.
- **A refactor MUST NOT** add features, change observable behavior, add a
  dependency (there is no runtime dependency, by rule), or change a CLI flag,
  default, output field or quoted number. Any of those is a behavior change and
  needs the README, `evals/results.md` and `scripts/doc-parity.mjs` updated in
  the same commit.
- **The invariants survive a refactor unchanged:** counts-only output, exact
  versus estimated labels, one count per assistant message, dry-run-by-default
  eval, `NODE_TEST_CONTEXT` stripped for child `node --test`. Re-run
  `node design/source/docs-kit/build.mjs --check` (it includes doc-parity) when
  `scripts/` or `evals/` change; never touch `design/source/`.
- **Tests are production code:** rename a test when its behavior is renamed,
  delete tests that no longer assert a contract, refactor a shared fixture once,
  and update a fixture the moment the code's I/O shape changes (a stale fixture
  silently exercises nothing).
- **Moving code out from under a test can leave it vacuous with no gate
  catching it.** After extracting or relocating behavior, confirm the test still
  fails when the new behavior is wrong, not just that it passes when it is right.
- **A full test-file rewrite must name what it must NOT touch.** Enumerate the
  functions whose existing coverage must survive, not just "don't drop tests".
