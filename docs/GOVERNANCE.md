# Governance

**In short:** one maintainer makes the decisions on this project. What keeps
that safe is process, not trust: every change, the maintainer's own included,
goes through the same required checks, signed commits and a review by someone
other than its author before it reaches `main`.

The model is a single maintainer with final say, sometimes called a BDFL
(Benevolent Dictator For Life). There is no committee and no vote. This page
also gives an honest account of the three OpenSSF Gold criteria that one active
maintainer cannot meet.

## Decision-making

- **Day-to-day changes** (fixes, docs, dependency bumps) are proposed as a pull
  request. The `main` ruleset needs a code-owner approval from someone other
  than the author, plus the required checks. The empty bypass list means nobody
  can skip either.
- **Changes to the contract** (the `measure.mjs` flags, exit codes and output
  fields, or the skill name, see
  [Versioning policy](../README.md#versioning-policy)) should be discussed in an
  issue first, so the reasoning is public.
- **Disputes**: a contributor who disagrees can reopen the discussion in the
  issue or pull request. The maintainer has the final say.
- **Security decisions** (triaging a report, dismissing a scan alert) follow
  [`SECURITY.md`](../SECURITY.md).

## Roles and members with access

| Role | Held by | Responsibilities |
| --- | --- | --- |
| **Maintainer** | [Enrico Lionello](https://github.com/enri3l), `monte3l` organization owner | Reviews and merges pull requests, triages issues, decides on design and releases, holds the GPG signing key |
| **Second owner and reviewer** | [giulmonte](https://github.com/giulmonte), `monte3l` organization owner | Code owner: approves the maintainer's pull requests, since the ruleset needs an approval from someone other than the author |
| **Security contact** | The maintainer | Receives reports through [private vulnerability reporting](../SECURITY.md#reporting-a-vulnerability) and follows its response process |
| **Contributor** | Anyone who opens an issue. Pull requests are limited to collaborators, see [Contributing](../CONTRIBUTING.md#pull-requests) | Follows [`CONTRIBUTING.md`](../CONTRIBUTING.md). Has no merge or release authority |

The two organization owners are the only people with access to sensitive
resources: the repository settings and `main` ruleset, the release GitHub App
credentials, the `docs-cloudflare` environment's Cloudflare token and the
organization-level `GITLEAKS_LICENSE`. The full list of those credentials is in
[`SECURITY.md`](../SECURITY.md#secrets-and-credentials). There is no other
collaborator. This list is updated in the same pull request that changes who
has access.

## Granting access

This covers write or admin access to this repository and membership of the
`monte3l` organization. Write access counts as access to secrets, because a
workflow run from a branch can reach a repository-level secret.

- **Who decides.** Only an organization owner grants access, and the other owner
  agrees first. No automation grants or widens it.
- **Review before the grant.** The owner checks two things first, and neither
  can be skipped:
  - **Track record.** The person has accepted contributions, made through issues
    because pull requests are limited to collaborators, or in another project
    the owners can look at.
  - **Identity.** Their GitHub account has two-factor authentication on, and an
    owner has confirmed who they are through a channel outside GitHub. The
    owner records which check was used in the issue that proposes the access.
- **Least privilege.** Access starts at `triage`. It moves to `write` after
  accepted contributions. Admin or organization ownership is only for a
  co-maintainer, and both checks are repeated for that wider scope.
- **Secrets.** No credential is shared with a collaborator in a message or a
  file.
- **Revocation.** Either owner can remove access at any time and tells the other
  afterwards. Access is reviewed at least once a year, and a collaborator with
  no activity for 12 months is reduced to `triage` or removed.

## Access continuity

If the maintainer becomes unavailable, the project must still be able to triage
issues, merge pull requests and cut a release within about a week. It depends
on three things:

- **Organization ownership.** It controls the ruleset, the secrets and the
  release App installation. The second owner holds it independently.
- **The release path.** A release is made by merging the release pull request,
  which the `release.yml` workflow opens. Nothing in it needs a key held by one
  person.
- **The maintainer's GPG signing key.** The ruleset requires signed commits.
  Losing the key without a successor blocks commits to `main` until someone with
  owner access configures a new one. Signing is machine-local.

The maintainer also keeps an emergency access kit (account recovery codes and a
backup of the signing key) in a password manager's emergency-access feature,
with a designated executor. This page does not name the executor or describe
the kit's contents, because the repository is public.

## Bus factor

Today the bus factor is **1**, stated plainly. The second owner reviews and
approves every pull request and can run the repository settings, but is not an
active co-maintainer who writes changes or drives a release end to end. Growing
past 1 is on the [roadmap](ROADMAP.md).

## Gold-level criteria this project does not meet

Three of the OpenSSF Best Practices Gold criteria cannot be met honestly with
one active maintainer. Each is recorded as **Unmet** in `.bestpractices.json`.

| Criterion | Why it stays unmet |
| --- | --- |
| `bus_factor` | It needs two or more people able to run the project. Today there is one |
| `contributors_unassociated` | It needs two significant contributors who are not affiliated with the same organization. Both people with access belong to `monte3l`, so it needs a contributor from outside it |
| `two_person_review` | It counts the share of recent changes reviewed by someone other than the author. Review is required on every change now, but the project is new and the share has to build up first |

This is why the Silver badge, not Gold, is the target.
