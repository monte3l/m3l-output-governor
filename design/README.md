# design/ -- m3l-design, vendored

This directory is m3l-output-governor's copy of **m3l-design**, the shared
design system for everything published under the `monte3l` GitHub org. It
styles the docs site at
[output-governor.monte3l.com](https://output-governor.monte3l.com).

- **Source:** [github.com/monte3l/m3l-design](https://github.com/monte3l/m3l-design)
- **Version copied:** `v1.3.2`
- **Last re-synced:** 2026-10-23
- **Date adopted:** 2026-10-19
- **Tier:** vendored. Earlier the repository followed the content tier, while
  it had no CSS, fonts or rendered pages.

## Governance: copy-based, not a live dependency

The model is a single spec, copied into each consuming project. There is no
`@monte3l/m3l-design` dependency anywhere in this repo, and there never
should be one.

## `source/` is vendored, verbatim -- never hand-edit it

Everything under `design/source/` is copied from a published `m3l-design`
release with its content unchanged. To move to a newer version, run
`bin/sync-design.sh vX.Y.Z <repo>` from an `m3l-design` checkout. It replaces
`source/`, `tokens.css` and `SHA256SUMS`, rewrites the version line above and
never touches this README's text.

| Path | What it holds |
| --- | --- |
| `source/dtcg/` | The canonical DTCG 2025.10 token source. It wins whenever it disagrees with `source/tokens.json` |
| `source/tokens.json` | The system's own flattened copy of the tokens. Nothing here reads it |
| `source/components/` | The v1 components as plain HTML and CSS, with each README's markup, tokens and contrast table |
| `source/foundations/contrast.md` | Every text and UI pairing per theme, all passing WCAG 2.2 AA |
| `source/fonts/` | Atkinson Hyperlegible Next and Mono, variable weight 200-800, under OFL-1.1 (see `source/licenses/`) |
| `source/brand-book.md` | The full design brief: personality, colour, type, shape, motion, accessibility, governance |
| `source/docs-kit/` | The docs site builder and its gates. Its README documents the config and the checks |

## `tokens.css` is vendored too

`design/tokens.css` comes from the release. It holds the light and dark custom
properties (by `prefers-color-scheme` and by an explicit `data-theme`), the
non-colour scale, the `@font-face` rules and one class per type style.

`design/SHA256SUMS` covers `source/` and `tokens.css`. The docs kit's
`--check` and the `verify` workflow both verify it, so a hand edit fails.
Change the files upstream.

## The docs site

`docs.config.mjs` lists the pages. A page is on the site only if it is in
`pages`, and every other tracked Markdown file must be in `exclude` with a
reason. The page shell is the kit's own `site.css`. This repository keeps no
`design/local/` overrides; if one is ever needed, the kit's Local CSS gate
holds it to `var(--token)` values only.

## Markdown rules

These apply to every Markdown file in the repository.

| Rule | Why |
| --- | --- |
| **Bold**, not italics or underlines, for emphasis | Italics and underlines make text run together |
| A GitHub alert (`> [!NOTE]`, `[!WARNING]`, `[!CAUTION]`) matched to severity for anything the reader must not miss | Each severity has its own glyph, so it survives without colour |
| Never stack more than two alerts, and never use `[!CAUTION]` except for data loss or anything irreversible | The Callout component's own rule |
| Plain, direct sentences | Part of the system's voice |
| Tabular data goes in a table | Easier to scan than a list pretending to be one |
