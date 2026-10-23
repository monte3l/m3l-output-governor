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

## Coding standards

| Standard | How it is enforced |
| --- | --- |
| `.editorconfig`: UTF-8, LF, two-space indent, final newline, no trailing whitespace | The `checks` lane of `verify.yml` runs `editorconfig-checker` over every tracked file this repository writes. Vendored `design/source/`, `design/tokens.css` and `design/SHA256SUMS`, committed `*.jsonl` runs and lockfiles are skipped |
| ES modules only: no `require`, no `module.exports` | `.claude/hooks/guard-no-commonjs.mjs` refuses the write |
| No dependency | The repository has no root `package.json`. Scripts are plain Node `.mjs` |
| Statement, branch and function coverage of at least 80% over `scripts/` and `evals/` | The `checks` lane runs Node's built-in coverage with those thresholds |

## Building and testing

There is nothing to build: the plugin is the committed source, run by Node 24 or
newer (`.node-version` is the authority). It has no runtime dependency, so
there is no library or SDK to install. To work on it, clone the repository and
run the commands in the
[README](README.md#working-on-this-repo).

| When | What runs |
| --- | --- |
| Before you push | `node --test "tests/*.test.mjs"`, `claude plugin validate --strict .` and `node design/source/docs-kit/build.mjs --check` |
| On every pull request and every push to `main` | The `verify` workflow runs the unit tests with the coverage gate, the style check, the harness tests, the docs gate, plugin validation and the DCO check. CodeQL, Dependency Review, Gitleaks, REUSE, actionlint, zizmor and commit lint run beside it |
| Never in CI | `node evals/p4.mjs --live` and `claude plugin eval`, because they are billed |

## Dependencies

The plugin and its scripts use no package. The only packages are the CI tools in
`.github/ci-tools/` (the pinned Claude Code) and `.github/deploy-tools/` (the
pinned wrangler), each pinned by a committed lockfile and installed with `npm ci`.
Every GitHub Action is pinned by commit SHA, and a repository setting allows only
a short list of them. Dependabot proposes bumps weekly after a cooldown, and
Dependency Review fails a pull request that adds a high-severity vulnerability or
a license outside the allow list (see [`SECURITY.md`](SECURITY.md)). Adding any
dependency needs a reason in the pull request and the maintainer's agreement,
because the no-dependency rule is part of why the plugin is safe to install.

## Pull requests

1. Branch off `main` as `feat/<slug>` or `fix/<slug>`.
2. Run the checks before pushing: `node --test "tests/*.test.mjs"`,
   `claude plugin validate --strict .` and
   `node design/source/docs-kit/build.mjs --check`.
3. Add or update tests for every major change, and a regression test for a fix.
   The coverage gate fails below 80%. A change to
   `scripts/measure.mjs` output also updates the README tables.
4. Resolve every review thread. A pull request merges when its required checks
   pass and a code owner other than its author approves it.

Markdown here follows m3l-design: bold, never italics, and tables for tabular
data.

The documentation site is built from the Markdown in this repository. A change
to a flag, a default, an output field or a measured number also updates the
README or `evals/results.md`: the docs check compares them with the code and the
committed runs, and fails with the name of what drifted. Fix the page, never
the kit.

## Versioning

Releases follow Semantic Versioning, and the contract is defined under
"Versioning policy" in the [README](README.md#versioning-policy).

## Releasing

Releases are automatic. Only a collaborator merges, and a tag cannot be moved or
deleted once the release is published (the org tags ruleset and immutable
releases), so review the release pull request before you merge it.

1. Write Conventional Commits. `fix:` is a patch, `feat:` a minor, and `!` or a
   `BREAKING CHANGE:` footer a major. The `Commit lint` check fails a pull
   request whose title or commits do not parse. Merge with a merge commit, never
   a squash, so every commit reaches the release notes.
2. On every merge to `main`, the `Release` workflow opens or updates one release
   pull request. It bumps `version` in `.claude-plugin/plugin.json` and writes
   the new section of `CHANGELOG.md`. Review both, then merge it with a merge
   commit.
3. Merging it tags `m3l-output-governor--vX.Y.Z` and creates the GitHub release
   as a draft with that changelog section as its notes. The workflow then
   attests and publishes it. Nothing is tagged by hand.
4. The workflow sends `release-published` to `monte3l/m3l-plugins`. Until that
   repository acts on it, bump the catalog pin there in a pull request: the
   `ref` is the tag and the `sha` is `git rev-parse m3l-output-governor--vX.Y.Z^{}`.
   `bin/bump-pins.mjs --check` there shows a stale pin.

The shared workflows are `release-prepare.yml` and `release-finalize.yml` in
`monte3l/.github`, and `.github/workflows/release.yml` here calls them. The org
blueprint's "Releases" section explains the flow.

Rerunning the live eval (`node evals/p4.mjs --live`, about $5) is optional for a
release and needs your approval for the cost first. So does the skill's own
suite, `claude plugin eval . --trust-plugin --no-publish --allow-tools 'Bash(node *)' --max-cost-usd 3`
(add `--model claude-haiku-5-5`, `claude-sonnet-5-5` or `claude-opus-5-5` to pick
one; about $0.02, $0.32 and $0.58). Keep `--no-publish`: by default a run also
publishes its report, prompts included, to claude.ai. A suite that fails
`no-auto-invocation` means the skill can be started by Claude, which it must not.

## Conduct

Everyone taking part is bound by the
[Code of Conduct](https://github.com/monte3l/.github/blob/main/CODE_OF_CONDUCT.md).
