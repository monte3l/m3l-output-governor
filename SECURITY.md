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
| Latest `1.x` release | Yes |
| Latest commit on `main` | Yes |
| Anything else | No |

This is a single-maintainer project. Only the latest release and the latest
commit on `main` get a fix.

### Scope and duration of support

Support has no fixed length. Each release is supported until the next release is
published, and from then on it gets no security update. A fix ships as a new
patch release on the current `1.x` line, never as a backport. When a `2.x`
release appears, `1.x` is supported for 90 days after it, and the release notes
state the date. Someone on an unsupported version should update to the latest
release.

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

You should get an acknowledgment within 7 days.

## Response process

This is the coordinated disclosure policy. The security contact is the
maintainer, reached through the advisory form above.

| Step | Target |
| --- | --- |
| Acknowledge the report | Within 7 days |
| Confirm or reject it, and say how severe it is | Within 14 days of the acknowledgment |
| Ship a fix for a confirmed medium, high or critical vulnerability | Within 60 days of confirmation |
| Publish a GitHub security advisory | When the fix is released, or after 90 days from the report if the reporter and the maintainer agree there is no fix to wait for |

Please keep the report private until the advisory is published. If a target
slips, the maintainer says so in the advisory thread and gives a new date.

## Credit

The advisory credits the reporter by the name or handle they choose, unless they
ask not to be named.

## Published vulnerability data

Every confirmed vulnerability gets a GitHub security advisory, with a CVE
requested when it qualifies. The advisories for this repository are listed under
its Security tab. None has been published so far.

## Dependency and code-scanning findings

| Tool | What it checks | Threshold |
| --- | --- | --- |
| Dependency Review (`dependency-review.yml`) | Dependencies a pull request adds or changes: known vulnerabilities and licenses | Fails the pull request on a `high` or `critical` vulnerability, or a license outside the allow list |
| Dependabot | Pinned Actions and the CI tools in `.github/ci-tools/` and `.github/deploy-tools/` | A bump arrives as a pull request after a cooldown. A `critical` or `high` advisory is merged as soon as its checks pass |
| CodeQL (default setup) | Static analysis of the JavaScript and the workflows, on every push and pull request | A required check, so a finding blocks the merge |
| zizmor and actionlint | The workflows | Fail the `workflow-lint` check |

**Remediation thresholds.** A `critical` or `high` finding in a dependency or in
the code is fixed before the change that introduced it merges, or before the next
release if it was already on `main`. A `medium` finding is fixed within 60 days.
A `low` finding is fixed or dismissed with a recorded reason within 90 days. A
license violation is fixed before merge, with no exception.

**Before a release.** No release is cut with an open `critical` or `high`
finding. A dismissed finding names its reason in the alert, and the accepted ones
are listed below.

**Vulnerabilities that do not affect the project.** When a scanner reports a
vulnerability in a component that this project does not exercise, the finding is
dismissed with its reason in the alert. If it is worth telling users, it is
published as an [OpenVEX](https://openvex.dev) document under `docs/`, so
scanners can read the non-exploitability statement. None exists today, because
the plugin ships no dependency.

## Secrets and credentials

The plugin itself stores no credential and makes no network call. These are the
credentials the repository's automation uses.

| Secret | Scope | Reaches |
| --- | --- | --- |
| `RELEASE_APP_CLIENT_ID`, `RELEASE_APP_PRIVATE_KEY` | Organization secrets, passed by name to the release workflow only | A GitHub App that opens the release pull request, creates the tag and publishes the release |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | The `docs-cloudflare` environment, used by the deploy job of `docs.yml` | Deploys the static docs site |
| `JANITOR_APP_CLIENT_ID`, `JANITOR_APP_PRIVATE_KEY` | Organization secrets, used by `environments.yml` | A GitHub App that deletes stale deployment environments |
| `GITLEAKS_LICENSE` | Organization secret shared with this repository | A free license for the Gitleaks action. It reads nothing in the repository |

No workflow holds an Anthropic API key. The live eval uses whichever credential
`claude` resolves on the maintainer's machine and never runs in CI.

**Storing.** A credential lives only in GitHub's secret store, or in the
maintainer's password manager. It is never written to a file in the repository,
a workflow log, an issue or a message. Secret scanning, push protection and
Gitleaks refuse a commit that contains one.

**Accessing.** A workflow gets a credential only by name, through `env:` or
`with:` on the one step that needs it, and never through `secrets: inherit`. A
pull request workflow gets none, except the Gitleaks license. Only the two
organization owners can read or change a secret.

**Rotating.** Each GitHub App's private key and the Cloudflare token are rotated at
least once a year, and the Gitleaks license is renewed annually. The old value
is revoked when the new one is in place.

**If one is exposed.** The owner revokes it at once, rotates it, checks the
workflow runs and the provider's audit log for use, and publishes an advisory if
anything was released or deployed with it.

## Verifying releases

A release has a signed git tag named `m3l-output-governor--vX.Y.Z`. From the
release after `1.0.0`, it also carries a source tarball
(`m3l-output-governor-X.Y.Z.tar.gz`) and its Sigstore bundle
(`m3l-output-governor-X.Y.Z.tar.gz.sigstore.json`). `1.0.0` was published
without assets, so only its tag can be verified.

**Integrity and authenticity of the tarball.** Download both assets, then run:

```zsh
gh attestation verify m3l-output-governor-X.Y.Z.tar.gz \
  --bundle m3l-output-governor-X.Y.Z.tar.gz.sigstore.json \
  -R monte3l/m3l-output-governor \
  --signer-workflow monte3l/m3l-output-governor/.github/workflows/release.yml
```

A pass means the file is byte-for-byte what the release workflow built from this
repository, and `--signer-workflow` pins the expected identity: that workflow
file in this repository, and nothing else.

**Identity of the tag's author.** Check the tag's signature against the
maintainer's public key, which is on their GitHub account:

```zsh
git tag -v m3l-output-governor--vX.Y.Z
```

Installing through the catalog pins the same tag and commit, so the commit it
resolves to is the one the tag points at.

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
| Maintained | 0 | Scorecard scores any repository under 90 days old as 0. This one was created on 2026-10-19, so it resolves itself in January 2027 |
| Fuzzing | 0 | Not applicable. The inputs are the maintainer's own local session transcripts and command-line arguments, not an untrusted network or binary parser. A fuzzing library would also end the repository's no-dependency rule |
| Contributors | 0 | The check counts contributors from distinct organizations, and every contributor here belongs to `monte3l`. It needs people from outside, which a code change cannot supply |
| CII-Best-Practices | 5 to 7 | The badge is at Passing and the target is Silver (Scorecard scores Passing 5, Silver 7, Gold 10). Gold needs `bus_factor` and `contributors_unassociated`, which one organization cannot meet, see [Governance](docs/GOVERNANCE.md#gold-level-criteria-this-project-does-not-meet) |

The OpenSSF Best Practices badge is a real gap, not an accepted one, up to
Silver. The alert stays open until the badge reaches Silver.
