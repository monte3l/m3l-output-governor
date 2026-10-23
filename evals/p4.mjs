// P4: does built-in Concise cut output tokens, same model and effort, without losing checked answers?
// A dry run prints the plan and an estimate. `--live` spawns `claude -p` sessions and spends money.
import { spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdtempSync, mkdirSync, appendFileSync, writeFileSync, readFileSync, globSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { measure } from '../scripts/measure.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = dirname(here)

const MODEL = 'claude-opus-5-5'
const EFFORT = 'medium'
const READ = 'Read Grep Glob'
const EST_COST_PER_RUN = 0.1 // measured on Opus 5.5: mean $0.0995 over a 3-run pilot (UNVERIFIED.md, Closed 13)
const RUN_TIMEOUT_MS = 240_000

const sh = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: 'utf8' })
const status = dir => sh('git', ['status', '--short'], dir).stdout.trim()
const testsPass = dir => {
  // A nested `node --test` inherits NODE_TEST_CONTEXT from a parent test runner and then reports success.
  const { NODE_TEST_CONTEXT, ...env } = process.env
  return spawnSync('node', ['--test', 'tests/measure.test.mjs'], { cwd: dir, encoding: 'utf8', env }).status === 0
}

// Left out of the fixture: git history, the eval itself and its test (so the one failing test is the seeded one),
// the project memory and notes that describe the seeded bug, installed dependencies, and the docs site's own
// checks and vendored design files (a failing test or a large tree there would change what each run sees).
const EXCLUDED = /\/(\.git|evals|docs|plugin-evals|\.claude|node_modules|UNVERIFIED\.md|tests\/evals\.test\.mjs|tests\/doc-parity\.test\.mjs|scripts\/doc-parity\.mjs|docs\.config\.mjs|design\/source|design\/tokens\.css|design\/SHA256SUMS)(\/|$)/

/**
 * A scratch copy of this repository with a seeded boundary bug in scripts/measure.mjs (`>=` made `>`),
 * two commits and one uncommitted change that logs a transcript path. Built from the working tree, so
 * results are comparable only between runs on the same commit of scripts/measure.mjs.
 */
export const buildFixture = (root = repoRoot) => {
  const dir = mkdtempSync(join(tmpdir(), 'p4-template-'))
  // Tracked files only, read from the working tree: ignored and untracked files (a local .env, notes) never reach a run.
  const listed = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  if (listed.status !== 0) throw new Error('buildFixture needs a git checkout: `git ls-files` failed')
  for (const rel of listed.stdout.split('\0').filter(Boolean)) {
    if (EXCLUDED.test(`/${rel}`) || !existsSync(join(root, rel))) continue
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    copyFileSync(join(root, rel), join(dir, rel))
  }
  const file = join(dir, 'scripts/measure.mjs')
  const source = readFileSync(file, 'utf8')
  if (!source.includes('if (r.chars >= gateChars) {')) throw new Error('fixture seed text not found in scripts/measure.mjs')
  writeFileSync(file, source.replace('if (r.chars >= gateChars) {', 'if (r.chars > gateChars) {'))
  const git = (...args) => spawnSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', ...args], { cwd: dir, encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  git('add', '-A')
  git('commit', '-q', '-m', 'chore: scaffold repository baseline')
  appendFileSync(join(dir, 'CHANGELOG.md'), '- Added the thinking split.\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'feat: add thinking split to measure')
  const seeded = readFileSync(file, 'utf8')
  if (!seeded.includes('    t.sessions++\n')) throw new Error('diff seed text not found in scripts/measure.mjs')
  writeFileSync(file, seeded.replace('    t.sessions++\n', "    t.sessions++\n    console.error('reading', file)\n"))
  return dir
}

export const TASKS = [
  { id: 'T1-explain', tools: READ, prompt: 'Explain what the measure function in scripts/measure.mjs does, and how it estimates re-read cost.',
    // Wording-tolerant: "later requests" or "every request after it"; "chars / 4" or "4 characters per token".
    check: t => /re-?read/i.test(t)
      && /(later|subsequent|following|remaining|every|each)\s+(assistant |model )?requests?|requests?\s+(after|following|that follow)/i.test(t)
      && /(chars?|characters)[^.\n]{0,40}(\b4\b|four)|(\b4\b|four)\s+(chars?|characters)|(÷|\/|divid\w*\s+by)\s*4/i.test(t) },
  { id: 'T2-locate', tools: `${READ} Bash(node --test:*)`, prompt: 'One unit test in tests/ fails. Find the cause without changing any files, and name the file and the condition at fault.',
    check: (t, dir, base) => /measure\.mjs/.test(t) && /(>=|at or over|greater than or equal|off-by-one|boundary|strictly|`>`)/i.test(t) && status(dir) === base },
  { id: 'T3-fix', tools: `${READ} Edit Bash(node --test:*)`, prompt: 'One unit test in tests/ fails. Fix the code so all tests pass, and run the tests to confirm.',
    check: (t, dir) => testsPass(dir) },
  { id: 'T4-review', tools: `${READ} Bash(git diff:*) Bash(git status:*) Bash(git log:*)`, prompt: 'Review the uncommitted changes in this repository and tell me whether they are safe to commit.',
    check: t => /(console\.error|stderr|logg?(s|ing)?)/i.test(t) && /(path|file ?name|counts[- ]only|invariant|leak)/i.test(t) },
  { id: 'T5-plan', tools: READ, prompt: 'Without editing anything, plan how to make scripts/measure.mjs also report an estimated cost in USD from per-million-token prices. List the steps.',
    check: (t, dir, base) => /measure\.mjs/.test(t) && /test/i.test(t) && /(price|rate|pricing|per million|\$)/i.test(t) && status(dir) === base },
  { id: 'T6-git', tools: 'Read Bash(git log:*) Bash(git status:*)', prompt: 'What commit message convention does this repository follow, judging from git log?',
    check: t => /(conventional|feat|chore|type:)/i.test(t) },
  { id: 'T7-config', tools: READ, prompt: 'What version and licence does the plugin manifest declare?',
    check: t => /0\.1\.0/.test(t) && /MIT/.test(t) },
  { id: 'T8-fact', tools: READ, prompt: 'Which Node major version does this repository pin?',
    check: t => /\b24\b/.test(t) },
]

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : dflt }

const main = () => {
  const live = process.argv.includes('--live')
  const reps = Number(arg('reps', '3'))
  const only = arg('tasks', 'all')
  const arms = arg('arms', 'default,concise').split(',')
  const maxSpend = Number(arg('max-spend', '5'))
  const outDir = join(here, '.results')
  const out = arg('out', join(outDir, `p4-${new Date().toISOString().slice(0, 10)}.jsonl`))
  const tasks = only === 'all' ? TASKS : TASKS.filter(t => only.split(',').some(p => t.id.startsWith(p)))
  const runs = tasks.length * arms.length * reps

  console.log(`P4 plan: ${tasks.length} tasks x ${arms.length} arms x ${reps} reps = ${runs} runs, ${MODEL} at effort ${EFFORT}`)
  console.log(`Estimated cost: about $${(runs * EST_COST_PER_RUN).toFixed(2)} (measured $${EST_COST_PER_RUN.toFixed(2)} per run on Opus 5.5), spend guard $${maxSpend.toFixed(2)}`)
  if (!live) {
    console.log('Dry run: nothing was spawned. Add --live to run; it spends money on the credential `claude` resolves.')
    return
  }

  mkdirSync(join(outDir, 'texts'), { recursive: true })
  const template = buildFixture()
  const done = new Set(readFileSync(out, { flag: 'a+', encoding: 'utf8' }).split('\n').filter(Boolean).map(l => JSON.parse(l))
    .filter(r => !r.error && r.outputTokens > 0).map(r => `${r.task}|${r.arm}|${r.rep}`))
  let spent = 0

  const runOne = (task, arm, rep, order) => {
    const dir = mkdtempSync(join(tmpdir(), 'p4-run-'))
    cpSync(template, dir, { recursive: true })
    const base = status(dir)
    const args = ['-p', task.prompt, '--model', MODEL, '--effort', EFFORT, '--allowedTools', task.tools, '--max-budget-usd', '1', '--output-format', 'stream-json', '--verbose']
    if (arm === 'concise') args.push('--settings', '{"outputStyle":"Concise"}')
    const t0 = Date.now()
    const r = spawnSync('claude', args, { cwd: dir, encoding: 'utf8', timeout: RUN_TIMEOUT_MS, maxBuffer: 256 * 1024 * 1024 })
    const sec = Math.round((Date.now() - t0) / 1000)
    const events = (r.stdout ?? '').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    const init = events.find(e => e.type === 'system' && e.subtype === 'init')
    const res = events.find(e => e.type === 'result')
    const calls = events.filter(e => e.type === 'assistant').flatMap(e => (e.message?.content ?? []).filter(b => b.type === 'tool_use').map(b => `${b.name}:${JSON.stringify(b.input)}`))
    const text = res?.result ?? ''
    let thinking = null, requests = null
    if (res?.session_id) {
      const f = globSync(join(homedir(), '.claude/projects/*', `${res.session_id}.jsonl`))[0]
      if (f) { const m = measure([f]); thinking = m.exact.thinking; requests = m.requests }
    }
    const row = {
      task: task.id, arm, rep, order, sec, model: Object.keys(res?.modelUsage ?? {}).join(','), style: init?.output_style ?? null,
      cost: res?.total_cost_usd ?? null, outputTokens: res?.usage?.output_tokens ?? null, thinkingTokens: thinking, requests,
      cacheCreate: res?.usage?.cache_creation_input_tokens ?? null, cacheRead: res?.usage?.cache_read_input_tokens ?? null,
      turns: res?.num_turns ?? null, toolCalls: calls.length, dupCalls: calls.length - new Set(calls).size,
      resultChars: text.length, pass: res && !res.is_error ? Boolean(task.check(text, dir, base)) : false,
      error: res ? (res.is_error ? res.subtype : null) : `no result (exit ${r.status})`,
    }
    writeFileSync(join(outDir, 'texts', `${task.id}_${arm}_${rep}.txt`), text)
    appendFileSync(out, JSON.stringify(row) + '\n')
    rmSync(dir, { recursive: true, force: true })
    spent += row.cost ?? 0
    if (row.error) { console.log(`ERROR ${task.id} ${arm} rep${rep}: ${row.error}; stopping`); process.exitCode = 3; return false }
    console.log(`${task.id} ${arm} rep${rep} cost=${row.cost?.toFixed(4)} out=${row.outputTokens} think=${row.thinkingTokens} pass=${row.pass} style=${row.style} spent=${spent.toFixed(3)}`)
    return true
  }

  try {
    outer: for (let rep = 1; rep <= reps; rep++) {
      for (const [i, task] of tasks.entries()) {
        const order = (rep + i) % 2 === 0 ? arms : [...arms].reverse()
        for (const arm of order) {
          if (done.has(`${task.id}|${arm}|${rep}`)) continue
          if (spent > maxSpend) { console.log(`spend guard hit at ${spent.toFixed(3)}; stopping`); break outer }
          if (!runOne(task, arm, rep, order.join('>'))) break outer
        }
      }
    }
  } finally {
    rmSync(template, { recursive: true, force: true })
  }
  if (!process.exitCode) console.log(`done, spent ${spent.toFixed(3)}; results in ${out}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
