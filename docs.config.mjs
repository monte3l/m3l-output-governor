// SPDX-FileCopyrightText: 2026 Enrico Lionello (enri3l), Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// Docs kit config. The kit is design/source/docs-kit/ (vendored from m3l-design);
// its README documents every key. Every tracked *.md file must be a page or be
// excluded with a reason, or `node design/source/docs-kit/build.mjs --check` fails.
export default {
  title: "m3l-output-governor",
  repo: "https://github.com/monte3l/m3l-output-governor",
  siteUrl: "https://output-governor.monte3l.com",
  designDir: "design",
  brand: true,
  manifest: ".claude-plugin/plugin.json", // its homepage must equal siteUrl
  navGroups: ["Start", "Reference", "Evidence", "Project", "Security"],
  pages: [
    { src: "README.md", out: "index.html", group: "Start", label: "Overview" },
    { src: "skills/measure/SKILL.md", out: "skill.html", group: "Reference", label: "Measure skill prompt" },
    { src: "evals/results.md", out: "results.html", group: "Evidence", label: "Evaluation results" },
    { src: "UNVERIFIED.md", out: "UNVERIFIED.html", group: "Evidence", label: "Open items" },
    { src: "CONTRIBUTING.md", out: "CONTRIBUTING.html", group: "Project", label: "Contributing" },
    { src: "design/README.md", out: "design.html", group: "Project", label: "Design system" },
    { src: "SECURITY.md", out: "SECURITY.html", group: "Security", label: "Security policy" },
  ],
  exclude: [
    { glob: "CHANGELOG.md", reason: "release notes live on the GitHub releases page" },
    { glob: ".claude/**", reason: "instructions for coding agents, not reader-facing" },
    { glob: "plugin-evals/**", reason: "claude plugin eval prompts and graders, test data, not reader-facing" },
    { glob: ".github/pull_request_template.md", reason: "GitHub pull request form, not reader-facing" },
    { glob: "design/source/**", reason: "vendored m3l-design release, never edited here; the kit and brand book are documented upstream" },
  ],
  parity: ["scripts/doc-parity.mjs"], // docs-versus-code checks, see lib/parity.mjs
};
