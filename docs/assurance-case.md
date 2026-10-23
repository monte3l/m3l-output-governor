# Security assurance case

This page explains why the plugin is reasonably safe to install and run. It
lists what could go wrong, and for each case what stops it and where that is
enforced. It follows the shape the OpenSSF Best Practices badge asks for: a
threat model, the trust boundaries it implies, the secure design principles
applied, and the common weaknesses countered. It also serves as the project's
security assessment and threat model for the Baseline `SA-03` criteria.

It covers the plugin as released: `scripts/measure.mjs`, the `measure` skill and
the manifest. The eval runner and CI are covered where they handle money or
credentials. The architecture is in [Architecture](architecture.md).

## Threat model

**Assets:**

- The user's session transcripts, which hold prompts, code and tool output.
- The user's credentials and money, which `evals/p4.mjs --live` can spend.
- The plugin's supply chain: the release tag, the catalog pin and the CI that
  builds and publishes the release.
- The repository settings, the release GitHub App credentials and the
  Cloudflare token for the docs site.

**Actors and threats considered:**

| Threat | Why it matters |
| --- | --- |
| The script leaks transcript content | The transcripts are private, and the output may be pasted into an issue |
| The skill is run without the user asking | It reads the user's session history |
| A hostile or malformed transcript or argument | The script runs with the user's privileges |
| A live eval spends money unasked | It uses whichever credential `claude` resolves |
| A compromised GitHub Action or CI dependency | It could alter the release or reach a credential |
| A pull request from a fork reaching a credential | Workflows run code from the branch |
| A tampered release | Users install a pinned tag through the catalog |
| An unreviewed or unsigned change reaching `main` | It would bypass every other control |

## Attack surface and critical code paths

| Code path | Input | Exposure |
| --- | --- | --- |
| `measure.mjs` file reading and JSON parsing | Local transcript files, which may be large or malformed | A local process reading the user's own files. No network, no write, no `eval` or shell |
| `measure.mjs` argument parsing and `--project` path building | Command-line arguments and two environment variables | The path is built from the current directory and read only |
| The skill's injected command | None from the user beyond the fixed command | Runs only through the pre-approved pattern |
| `p4.mjs` child processes | Fixed arguments and a scratch directory | Spawns `claude` and `git` with an argument array, never a shell string |
| CI workflows | Pull request branches and metadata | Read-only tokens, values passed through `env:` |

## Trust boundaries

1. **Transcripts to script.** The files are Claude Code's own output, but a
   transcript can contain anything a tool returned, so every field is treated as
   untrusted data. It is parsed, measured and discarded.
2. **Script to the user's screen.** Only counts and tool names cross it. This is
   the boundary the planted-secret test checks.
3. **Plugin to Claude Code.** The skill gets a narrow `allowed-tools` rule, and
   the plugin registers no hook, MCP server or `bin/` entry.
4. **Contributor to `main`.** Pull requests are limited to collaborators, and the
   ruleset needs signed commits, a code-owner approval and the required checks.
5. **CI to credentials.** No workflow uses `pull_request_target` or
   `workflow_run`. Pull request workflows hold read-only tokens.

## Secure design principles applied

| Principle | How it shows up | Where it is enforced |
| --- | --- | --- |
| Least privilege | The skill pre-approves one command. Workflows start from `permissions: {}` or `contents: read` and grant more per job | `skills/measure/SKILL.md`, `.github/workflows/`, zizmor |
| Economy of mechanism | One script, plain Node, no dependency, no network | No root `package.json` |
| Fail-safe defaults | The skill is user-invoked only. `p4.mjs` is a dry run until `--live` and stops at the first error row | `scripts/doc-parity.mjs` checks `disable-model-invocation`. `tests/evals.test.mjs` |
| Complete mediation | Every change goes through the `main` ruleset | The branch ruleset, with an empty bypass list |
| Open design | Everything is public, and the script is short enough to read before installing | The README says so |
| Separation of privilege | A merge needs a person other than the author, and a release needs the release workflow and a signed tag | Ruleset, `release.yml` |
| Least common mechanism | The plugin shares no state with other plugins | The manifest |
| Psychological acceptability | The report labels each figure exact or estimated | The README and `.claude/CLAUDE.md` |

## Common implementation weaknesses countered

| Weakness | Counter | Where |
| --- | --- | --- |
| CWE-200 information exposure | Output is counts only, and a test plants a secret in a transcript and checks that it never appears | `tests/measure.test.mjs` |
| CWE-20 improper input validation | Unknown flags exit 2, `--gate` must be a positive number, bad lines and unreadable files are skipped and counted | `scripts/measure.mjs`, its tests |
| CWE-78 and CWE-94 command and code injection | The script runs no shell and no `eval`. The runner spawns with argument arrays. Workflows pass event values through `env:` | zizmor, CodeQL |
| CWE-22 path traversal | `--project` builds one directory path from the current directory and only reads it | `projectDir`, tested |
| CWE-400 uncontrolled resource use | Each live eval run has a budget cap and a timeout, and the run stops at the first error row | `evals/p4.mjs` |
| CWE-798 hard-coded credentials | Secret scanning, push protection and Gitleaks on every push | `.github/workflows/gitleaks.yml` |
| CWE-1357 untrusted components | Actions are pinned by commit SHA, the CI tools by lockfile hash, and Dependabot proposes bumps after a cooldown | `.github/dependabot.yml`, Scorecard |
| CWE-829 inclusion of untrusted functionality | A repository setting allows only listed actions and requires SHA pins | Actions permissions |

## Residual risks

- **The estimates overstate.** Figures derived from characters ignore
  compaction. They are labelled estimated for that reason.
- **The transcript format can change.** Claude Code owns it, so a change could
  make the script count wrongly. It does not make it print more.
- **The accepted CI install script.** The `plugin` lane installs Claude Code
  with its install script. The lockfile pins it by hash, and the job has
  read-only permissions and no secrets (see [`SECURITY.md`](../SECURITY.md)).
- **One maintainer.** See [Governance](GOVERNANCE.md#bus-factor).
