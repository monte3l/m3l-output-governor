# Security Policy

## Scope

This covers `m3l-output-governor`: the scripts in `scripts/` and `evals/`, and
the CI that checks them. `scripts/measure.mjs` reads local Claude Code session
transcripts and prints counts only, never prompt text, tool output or paths.
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
transcript content, name the exact field.

You should get an acknowledgment within 7 days. There is no fixed disclosure
timeline beyond that, but you will hear back before a fix ships.

## Secrets this repository holds

| Secret | Scope | Reaches | Expiry |
| --- | --- | --- | --- |
| `GITLEAKS_LICENSE` | Organization secret shared with this repository | A free license for the Gitleaks action. It reads nothing in the repository | Annual renewal |

No workflow holds an Anthropic API key. The live eval reads one from the
maintainer's shell and never runs in CI.

> [!NOTE]
> Accepted risk: `verify.yml` installs `@anthropic-ai/claude-code` from
> `.github/ci-tools/` **with** its install script, because the script fetches
> the native binary. The lockfile pins the package by integrity hash, Dependabot
> proposes bumps after a one-day cooldown, and the job holds read-only
> permissions and no secrets.
