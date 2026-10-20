# Security Policy

## Scope

This covers `m3l-output-governor`: the scripts in `scripts/` and `evals/`, and
the CI that checks them. `scripts/measure.mjs` reads local Claude Code session
transcripts and prints counts and tool names only, never prompt text, tool output or paths.
`evals/p4.mjs` runs `claude -p` with whichever credential `claude` resolves and
spends money only when given `--live`.

## Supported versions

| Version | Supported |
| --- | --- |
| Latest commit on `main` | Yes |
| Anything else | No |

This is a single-maintainer project. Only the latest commit on `main` gets a fix.

## Reporting a vulnerability

Use GitHub's [private vulnerability reporting](https://github.com/monte3l/m3l-output-governor/security/advisories/new)
for this repository.

> [!IMPORTANT]
> Do not open a public issue for a suspected vulnerability.

Include the affected version, the steps to reproduce and the impact you think
it has. If you think any output of `measure.mjs` or `summarize.mjs` can leak
transcript content, name the exact field. A live eval also writes full answer
text to `evals/.results/texts/`, which is gitignored and stays on the
maintainer's machine.

You should get an acknowledgment within 7 days. There is no fixed disclosure
timeline beyond that, but you will hear back before a fix ships.

## Secrets this repository holds

| Secret | Scope | Reaches | Expiry |
| --- | --- | --- | --- |
| `GITLEAKS_LICENSE` | Organization secret shared with this repository | A free license for the Gitleaks action. It reads nothing in the repository | Annual renewal |

No workflow holds an Anthropic API key. The live eval uses whichever credential
`claude` resolves on the maintainer's machine and never runs in CI.

> [!NOTE]
> Accepted risk: the `plugin` lane of `verify.yml` installs
> `@anthropic-ai/claude-code` from `.github/ci-tools/` **with** its install script, because the script fetches
> the native binary. The lockfile pins the package by integrity hash, Dependabot
> proposes bumps after a one-day cooldown, and the job holds read-only
> permissions and no secrets.

## Accepted OpenSSF Scorecard findings

Background, not policy: this explains the Scorecard results for anyone who
looks them up. `scorecard.yml` runs weekly and surfaces its findings as Code
Scanning alerts. The ones below are dismissed as deliberate or time-based, not
defects. Do not "fix" the first one into a standing bypass.

| Check | Score | Why it stays |
| --- | --- | --- |
| Branch-Protection | 8 | The top tier asks for two approvals. The organization has two members, so a PR has one reviewer who is not its author, and requiring two would block every merge unless a standing bypass existed. The `main` ruleset has an empty bypass list on purpose. Every other protection is on: a code-owner approval, approval of the last push, stale-review dismissal, an up-to-date branch, required checks, signed commits, and no force-push or deletion |
| Code-Review | 6 | The first commits landed before the `main` ruleset existed. Every PR since needs a code-owner approval, so the approved share rises as PRs merge. The alert is dismissed only until the score reaches 10 |
| Maintained | 0 | Scorecard scores any repository under 90 days old as 0. This one was created on 2026-10-19, so it resolves itself in January 2027 |
| Fuzzing | 0 | Not applicable. The inputs are the maintainer's own local session transcripts and command-line arguments, not an untrusted network or binary parser. A fuzzing library would also end the repository's no-dependency rule |

The OpenSSF Best Practices badge is a real gap, not an accepted one. The
project registers for it, and the alert stays open until the badge reaches
Passing.
