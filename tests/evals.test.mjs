import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
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
    assert.notEqual(run('node', ['--test', 'tests/measure.test.mjs']).status, 0)
    assert.equal(run('git', ['rev-list', '--count', 'HEAD']).stdout.trim(), '2')
    assert.equal(run('git', ['status', '--short']).stdout.trimEnd(), ' M scripts/measure.mjs')
    assert.match(run('git', ['diff']).stdout, /\+\s+console\.error\('reading', file\)/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('each task has an id, a prompt, tools and a check that rejects empty text', () => {
  assert.equal(TASKS.length, 8)
  for (const t of TASKS.filter(t => t.id !== 'T3-fix')) {
    assert.ok(t.id && t.prompt && t.tools)
    assert.equal(Boolean(t.check('', '.', '')), false, t.id)
  }
  assert.equal(TASKS.find(t => t.id === 'T8-fact').check('The repository pins Node 24.'), true)
})
