import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildFixture, TASKS } from '../evals/p4.mjs'
import { summarize, pairUp, validRows, toMarkdown } from '../evals/summarize.mjs'

const p4 = fileURLToPath(new URL('../evals/p4.mjs', import.meta.url))

const row = (task, arm, rep, outputTokens, extra = {}) => ({
  task, arm, rep, outputTokens, thinkingTokens: 0, resultChars: outputTokens * 2, cost: 0.1, pass: true, error: null, ...extra,
})

test('a dry run spawns nothing and prints the plan and an estimate', () => {
  const r = spawnSync('node', [p4, '--tasks', 'T8', '--reps', '2'], { encoding: 'utf8' })
  assert.equal(r.status, 0)
  assert.match(r.stdout, /1 tasks x 2 arms x 2 reps = 4 runs/)
  assert.match(r.stdout, /Estimated cost: about \$0\.40/)
  assert.match(r.stdout, /Dry run: nothing was spawned/)
})

test('errored and empty runs are excluded and an unpaired run is dropped', () => {
  const rows = [
    row('T1', 'default', 1, 100), row('T1', 'concise', 1, 80),
    row('T2', 'default', 1, 100), row('T2', 'concise', 1, 0, { error: 'success' }),
    row('T3', 'default', 1, 50),
  ]
  assert.equal(validRows(rows).length, 4)
  assert.equal(validRows([...rows, row('T4', 'default', 1, 0)]).length, 4)
  assert.deepEqual(pairUp(rows).map(p => p.task), ['T1'])
  assert.equal(summarize(rows).excludedErrorRuns, 1)
})

test('summarize reports totals, the median per pair and pass counts', () => {
  const rows = [
    row('T1', 'default', 1, 100), row('T1', 'concise', 1, 50),
    row('T2', 'default', 1, 200), row('T2', 'concise', 1, 200, { pass: false }),
    row('T3', 'default', 1, 100), row('T3', 'concise', 1, 120),
  ]
  const s = summarize(rows)
  assert.equal(s.pairs, 3)
  assert.equal(s.outputTokens.default, 400)
  assert.equal(s.outputTokens.concise, 370)
  assert.equal(Math.round(s.outputTokens.changePct * 10), -75)
  assert.equal(s.medianPairChangePct.value, 0)
  assert.equal(s.medianPairChangePct.conciseLower, 1)
  assert.deepEqual(s.passed, { default: 3, concise: 2 })
  assert.match(toMarkdown(s), /Pairs: 3\./)
})

test('summarize is deterministic and handles no pairs', () => {
  const rows = [row('T1', 'default', 1, 100), row('T1', 'concise', 1, 80), row('T2', 'default', 1, 90), row('T2', 'concise', 1, 70)]
  assert.deepEqual(summarize(rows), summarize(rows))
  assert.equal(summarize([]).pairs, 0)
  assert.match(toMarkdown(summarize([])), /No complete pairs/)
})

test('the fixture has a failing test, two commits and one uncommitted change', () => {
  const dir = buildFixture()
  try {
    // A nested `node --test` inherits NODE_TEST_CONTEXT from this runner and then reports success, so drop it.
    const { NODE_TEST_CONTEXT, ...env } = process.env
    const run = (cmd, args) => spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', env })
    assert.notEqual(run('node', ['--test', 'tests/*.test.mjs']).status, 0)
    assert.equal(run('node', ['--test', 'tests/*.test.mjs']).stdout.match(/^ℹ fail (\d+)/m)?.[1], '1')
    for (const gone of ['.claude', 'UNVERIFIED.md', 'node_modules', 'evals', 'tests/evals.test.mjs']) assert.equal(existsSync(join(dir, gone)), false, gone)
    assert.equal(run('git', ['rev-list', '--count', 'HEAD']).stdout.trim(), '2')
    assert.equal(run('git', ['status', '--short']).stdout.trimEnd(), ' M scripts/measure.mjs')
    assert.match(run('git', ['diff']).stdout, /\+\s+console\.error\('reading', file\)/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('each task has an id, a prompt, tools and a check that rejects empty text (T3-fix runs the tests instead)', () => {
  assert.equal(TASKS.length, 8)
  for (const t of TASKS.filter(t => t.id !== 'T3-fix')) {
    assert.ok(t.id && t.prompt && t.tools)
    assert.equal(Boolean(t.check('', '.', '')), false, t.id)
  }
  assert.equal(TASKS.find(t => t.id === 'T8-fact').check('The repository pins Node 24.'), true)
})

test('the fixture copies tracked files only, so an untracked or ignored file never reaches a run', () => {
  const root = mkdtempSync(join(tmpdir(), 'p4-root-'))
  let dir
  try {
    mkdirSync(join(root, 'scripts'))
    copyFileSync(fileURLToPath(new URL('../scripts/measure.mjs', import.meta.url)), join(root, 'scripts/measure.mjs'))
    writeFileSync(join(root, 'CHANGELOG.md'), '# Changelog\n')
    writeFileSync(join(root, '.gitignore'), 'ignored.txt\n')
    spawnSync('git', ['init', '-q'], { cwd: root })
    spawnSync('git', ['add', '-A'], { cwd: root })
    writeFileSync(join(root, '.env'), 'SECRET=1\n')
    writeFileSync(join(root, 'ignored.txt'), 'x\n')
    dir = buildFixture(root)
    assert.equal(existsSync(join(dir, 'scripts/measure.mjs')), true)
    assert.equal(existsSync(join(dir, 'CHANGELOG.md')), true)
    for (const gone of ['.env', 'ignored.txt']) assert.equal(existsSync(join(dir, gone)), false, gone)
  } finally {
    rmSync(root, { recursive: true, force: true })
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

test('the T1 check accepts the wordings real answers use and still rejects an unrelated one', () => {
  const t1 = TASKS.find(t => t.id === 'T1-explain').check
  assert.equal(t1('A result is re-read on every request after it appears. Tokens are chars / 4.'), true)
  assert.equal(t1('Re-read cost counts later requests. It uses 4 characters per token.'), true)
  assert.equal(t1('It sums the usage fields and prints totals.'), false)
  assert.equal(t1('Re-read cost depends on the result size. Chars / 4 gives tokens.'), false)
})
