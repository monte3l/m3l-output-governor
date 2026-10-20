import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import parity, { NUMBER_TABLE, checkNumbers, expandNeedle, fieldPathsFromCells, flattenPaths, formatNumber, tables } from '../scripts/doc-parity.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

test('flattenPaths lists leaves, stops at an open map and keeps arrays whole', () => {
  const value = { a: 1, exact: { input: 2, nested: { deep: 3 } }, by: { Bash: 1, Read: 2 }, list: [1, 2] }
  assert.deepEqual(flattenPaths(value, ['by']), ['a', 'exact.input', 'exact.nested.deep', 'by', 'list'])
  assert.deepEqual(flattenPaths({}, []), [])
})

test('a renamed or added field changes the flattened set', () => {
  const before = flattenPaths({ exact: { output: 1 } }, [])
  assert.notDeepEqual(flattenPaths({ exact: { outputs: 1 } }, []), before)
  assert.notDeepEqual(flattenPaths({ exact: { output: 1, extra: 2 } }, []), before)
})

test('fieldPathsFromCells expands bare names and leading-dot names from the cell prefix', () => {
  const cells = ['`sessions`, `requests`', '`exact.input`, `cacheRead`', '`estimated.rereadTokens.allToolResults`, `.bash`, `.bashOverGate`', '`exact.thinking`, `thinkingShareOfOutput`']
  assert.deepEqual(fieldPathsFromCells(cells), [
    'sessions', 'requests',
    'exact.input', 'exact.cacheRead',
    'estimated.rereadTokens.allToolResults', 'estimated.rereadTokens.bash', 'estimated.rereadTokens.bashOverGate',
    'exact.thinking', 'exact.thinkingShareOfOutput',
  ])
})

test('tables splits a document into its pipe tables', () => {
  const found = tables('text\n\n| A |\n| - |\n| 1 |\n\nmore\n\n| B |\n| - |\n| 2 |')
  assert.equal(found.length, 2)
  assert.ok(found[1].startsWith('| B |'))
})

test('formatNumber fixes decimals, signs positives on request and never prints -0', () => {
  assert.equal(formatNumber(-16.84, 1, true), '-16.8')
  assert.equal(formatNumber(22.26, 1, true), '+22.3')
  assert.equal(formatNumber(22.26, 1), '22.3')
  assert.equal(formatNumber(0.4, 0, true), '0')
  assert.equal(formatNumber(-0.4, 0, true), '0')
  assert.equal(formatNumber(2.2, 2), '2.20')
})

test('expandNeedle fills plain and signed placeholders in order, with per-placeholder decimals', () => {
  assert.equal(expandNeedle('| {} | {+}% |', [24, 3.14159], [0, 1]), '| 24 | +3.1% |')
  assert.equal(expandNeedle('{}%', [-17.2], 0), '-17%')
  assert.throws(() => expandNeedle('{} {}', [1], 0), /no number for placeholder 2/)
})

test('checkNumbers passes a matching figure and names the one that drifted', () => {
  const table = [{ file: 'doc.md', needle: 'fell {}%', decimals: 0, metric: ({ v }) => [v] }]
  assert.deepEqual(checkNumbers(table, { 'doc.md': 'Output fell 17% overall' }, { v: 16.8 }), [])
  const drift = checkNumbers(table, { 'doc.md': 'Output fell 18% overall' }, { v: 16.8 })
  assert.equal(drift.length, 1)
  assert.match(drift[0], /doc\.md does not contain "fell 17%"/)
  assert.match(checkNumbers(table, {}, { v: 1 })[0], /doc\.md was not read/)
})

test('every declared number names a file and a placeholder per metric value', () => {
  for (const entry of NUMBER_TABLE) {
    assert.ok(['README.md', 'evals/results.md', 'UNVERIFIED.md'].includes(entry.file), entry.needle)
    assert.match(entry.needle, /\{\+?\}/, entry.needle)
    assert.equal(typeof entry.metric, 'function')
  }
})

test('the repository documentation agrees with its code and committed runs', async () => {
  assert.deepEqual(await parity({ root: ROOT }), [])
})
