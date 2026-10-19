# Contributing

`m3l-output-governor` measures where Claude Code's output tokens go. Open an
**issue** first for anything beyond a small fix, so the direction is agreed
before you spend time on it. Pull requests are limited to collaborators: if
you cannot open one, the issue is the contribution, and a collaborator will
pick it up.

## Reporting a bug

Open an issue at
[`monte3l/m3l-output-governor`](https://github.com/monte3l/m3l-output-governor/issues/new/choose)
and say:

- the commit you ran and your Node and Claude Code versions,
- the command, what you expected and what happened,
- for a wrong count, which field of the output is off. Do not paste session
  transcripts or prompt text.

Report a suspected security vulnerability privately. See
[`SECURITY.md`](SECURITY.md), and never open a public issue for it.

## Commits

| Rule | Why |
| --- | --- |
| [Conventional Commits](https://www.conventionalcommits.org) | The changelog comes from the message |
| `Signed-off-by:` trailer (`git commit -s`) | Developer Certificate of Origin: you may submit this |
| GPG- or SSH-signed | The `main` ruleset rejects unsigned commits |

## Pull requests

1. Branch off `main` as `feat/<slug>` or `fix/<slug>`.
2. Run the checks before pushing: `node --test "tests/*.test.mjs"` and
   `claude plugin validate --strict .`.
3. Add tests for new behavior and a regression test for a fix. A change to
   `scripts/measure.mjs` output also updates the README tables.
4. Resolve every review thread. A pull request merges when its required checks
   pass and a code owner other than its author approves it.

Markdown here follows m3l-design: bold, never italics, and tables for tabular
data.

## Conduct

Everyone taking part is bound by the
[Code of Conduct](https://github.com/monte3l/.github/blob/main/CODE_OF_CONDUCT.md).
