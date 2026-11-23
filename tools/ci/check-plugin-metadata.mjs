#!/usr/bin/env node
/**
 * Plugin metadata parity, run from a plugin repository's `verify` on every pull
 * request: `.claude-plugin/plugin.json` must say what the GitHub repository
 * says. The org's baseline already holds the GitHub description and topics to
 * `blueprint/projects.json`, so this closes the loop: the plugin manifest, the
 * repository and the org site cannot drift apart without a red pull request.
 *
 * - `description` must equal the repository description, word for word.
 * - `keywords`, when the manifest has them, must equal the repository topics
 *   (any order). A manifest without `keywords` passes: the field is optional.
 *
 * Claude Code's plugin reference makes `description`, `keywords` and `author`
 * optional and ties none of them to GitHub, so this is org policy, not a rule
 * `claude plugin validate` checks.
 *
 * The check compares with the live repository, so a change to a description
 * or a topic goes in two steps: edit the repository setting first (`gh repo
 * edit`), then merge the manifest change and re-run the failed check.
 *
 * Usage: node bin/check-plugin-metadata.mjs [--repo OWNER/NAME] [--root DIR]
 *   --repo  defaults to $GITHUB_REPOSITORY
 *   --root  defaults to the current directory
 * Needs `gh` and a token in GH_TOKEN (`${{ github.token }}` is enough).
 * Exit 0 clean, 1 a mismatch, 2 the manifest or the repository could not be read.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @param {{ description?: unknown, keywords?: unknown }} plugin the parsed plugin.json
 * @param {{ description: string | null, topics: string[] }} repo what GitHub says
 * @returns {string[]} one line per mismatch, empty when they agree
 */
export function mismatches(plugin, repo) {
  const problems = [];
  const description = typeof plugin.description === "string" ? plugin.description.trim() : "";
  const live = (repo.description ?? "").trim();
  if (description === "") problems.push("plugin.json has no description: set it to the repository description");
  else if (description !== live) problems.push(`plugin.json description is "${description}", the repository says "${live}"`);
  if (plugin.keywords !== undefined) {
    if (!Array.isArray(plugin.keywords) || plugin.keywords.some((k) => typeof k !== "string")) {
      problems.push("plugin.json keywords is not a list of strings");
    } else {
      const have = new Set(plugin.keywords);
      const want = new Set(repo.topics);
      const extra = [...have].filter((k) => !want.has(k)).sort();
      const missing = [...want].filter((k) => !have.has(k)).sort();
      if (extra.length > 0) problems.push(`plugin.json keywords not in the repository topics: ${extra.join(", ")}`);
      if (missing.length > 0) problems.push(`repository topics not in plugin.json keywords: ${missing.join(", ")}`);
    }
  }
  return problems;
}

function isEntryPoint() {
  try {
    return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

function argument(name, fallback) {
  const at = process.argv.indexOf(name);
  return at >= 0 && process.argv[at + 1] !== undefined ? process.argv[at + 1] : fallback;
}

function main() {
  const root = argument("--root", process.cwd());
  const repoName = argument("--repo", process.env.GITHUB_REPOSITORY);
  if (!repoName) {
    process.stderr.write("check-plugin-metadata: no repository: pass --repo OWNER/NAME or set GITHUB_REPOSITORY\n");
    return 2;
  }
  let plugin;
  try {
    plugin = JSON.parse(fs.readFileSync(path.join(root, ".claude-plugin", "plugin.json"), "utf8"));
  } catch (error) {
    process.stderr.write(`check-plugin-metadata: cannot read .claude-plugin/plugin.json: ${error.message}\n`);
    return 2;
  }
  let repo;
  try {
    const raw = execFileSync("gh", ["api", `repos/${repoName}`], { encoding: "utf8" });
    const parsed = JSON.parse(raw);
    repo = { description: parsed.description ?? null, topics: Array.isArray(parsed.topics) ? parsed.topics : [] };
  } catch (error) {
    process.stderr.write(`check-plugin-metadata: cannot read ${repoName} from GitHub: ${error.message}\n`);
    return 2;
  }
  const problems = mismatches(plugin, repo);
  for (const problem of problems) process.stderr.write(`check-plugin-metadata: ${problem}\n`);
  if (problems.length === 0) process.stdout.write("plugin metadata matches the repository\n");
  return problems.length === 0 ? 0 : 1;
}

if (isEntryPoint()) process.exit(main());
