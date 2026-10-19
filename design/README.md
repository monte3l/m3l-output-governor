# design/ -- m3l-design, adopted

This repository follows **m3l-design**, the shared design system for
everything published under the `monte3l` GitHub org.

- **Source:** [github.com/monte3l/m3l-design](https://github.com/monte3l/m3l-design)
- **Version adopted:** `v1.0.0`
- **Date adopted:** 2026-10-19
- **Tier:** content

## What "content tier" means here

This repository has no CSS, no fonts, no rendered pages and no coloured
terminal output, so nothing is vendored. Only the markdown conventions apply:

| Rule | Why |
| --- | --- |
| **Bold**, not italics or underlines, for emphasis | Italics and underlines make text run together |
| A GitHub alert (`> [!NOTE]`, `[!WARNING]`, `[!CAUTION]`) matched to severity for anything the reader must not miss | Each severity has its own glyph, so it survives without colour |
| Never stack more than two alerts, and never use `[!CAUTION]` except for data loss or anything irreversible | The Callout component's own rule |
| Plain, direct sentences | Part of the system's voice |
| Tabular data goes in a table | Easier to scan than a list pretending to be one |

## Moving to the vendored tier

Adding CSS, a docs site or coloured terminal output moves the repository to the
vendored tier: change the marker line to ``- **Version copied:** `vX.Y.Z` ``,
then run `bin/sync-design.sh vX.Y.Z <repo>` from an `m3l-design` checkout. Never
hand-edit `design/source/`, and never add a live `@monte3l/m3l-design`
dependency.
