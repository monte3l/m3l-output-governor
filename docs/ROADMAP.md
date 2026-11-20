---
reviewed: 2026-11-20
---

# Roadmap

What this project intends to do, and not do, over roughly the next year. It
lists what is still ahead. What has shipped is in the git history and the
GitHub releases, and what has been confirmed by a live check is in
[`UNVERIFIED.md`](../UNVERIFIED.md). Work that can be closed is a GitHub issue,
linked from here. What stays true until something changes is written here, so it
survives outside any one tool. The rule for which goes where is the org's
[tracking policy](https://github.com/monte3l/.github/blob/main/blueprint/tracking.md).

## Now: the 1.x series

The contract in the [Versioning policy](../README.md#versioning-policy) is
stable. Fixes, docs and CI changes ship as patch releases. A new flag or output
field ships as a minor release and leaves existing ones unchanged.

Keep the measurements current. Re-run the checks in `UNVERIFIED.md` when Claude
Code changes the behaviour a claim rests on (the transcript fields, the Concise
style, the plugin policies), and re-run the P4 eval only when it would change a
recommendation. This is ordinary maintenance, not a milestone.

## Next 12 months

- **First signed release asset.** Tracked in
  [#57](https://github.com/monte3l/m3l-output-governor/issues/57). The release
  workflow now attaches a source tarball and its Sigstore bundle. The next
  release is the first to carry them, and it is the check that the job works end
  to end.

## Known limits

- **One person authors and releases.** See
  [Governance](GOVERNANCE.md#bus-factor). Growing the bus factor past 1 needs a
  second maintainer who takes on release and security-response duties, and
  contributors from outside the organization. There is no committed timeline.
- **Only `claude -p` has run the skill.** The same skill file is used
  interactively, so the risk is low, but it is not checked. See item 3 below.

## Unverified

The open claims are in [`UNVERIFIED.md`](../UNVERIFIED.md), each with its source
and the date it was last looked at. Three are open:

- **Whether a custom output style could beat Concise** (item 1). The case is
  weak, because Concise already cut long answers by 16 to 42% and left short ones
  unchanged. It goes ahead only if a measurement shows at least a 10% gain over
  Concise.
- **Running the skill in an interactive session** (item 3).
- **What `claude plugin eval` can cover** (item 5).

## What this project will not do

- **Rebuild the tool-result shrinking hook** without a workload where Bash
  results clear 10% of billed input at the planned gate. The baseline measured
  about 2% (`UNVERIFIED.md`, Closed 2 and 18).
- **Add a runtime dependency.** The plugin has no `package.json` and no network
  call, and that is part of why it is safe to install.
- **Rewrite Claude's prose or earlier turns.** Output tokens are billed when
  generated, and rewriting the past breaks the cached prefix.
- **Print anything from a transcript except counts.** The planted-secret test
  enforces it.
- **Run a live eval in CI.** It needs a credential and spends money, so it runs
  only by hand with approval.
