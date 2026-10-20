// Fails when the documentation and the code disagree: the measure.mjs flags and gate default, the JSON
// output field paths, the p4.mjs flags and defaults, the task and row-field counts, the skill invocation,
// and every measured number the README and evals/results.md quote from the committed P4 runs.
//
// The docs kit runs this as a parity module (docs.config.mjs `parity`), so `node
// design/source/docs-kit/build.mjs --check` covers it. Standalone: `node scripts/doc-parity.mjs`
// prints ok or the drift and exits 1. Numbers are recomputed from evals/p4-2026-10-19*.jsonl with
// evals/summarize.mjs; nothing here spawns a live eval (the p4.mjs dry run is the only child process).
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { assertSame, assertSameSet, codeSpans, section, tableColumn } from '../design/source/docs-kit/lib/parity.mjs'
import { TASKS } from '../evals/p4.mjs'
import { pairUp, summarize } from '../evals/summarize.mjs'
import { DEFAULT_GATE_CHARS, measure } from './measure.mjs'

export const RUN_FILES = ['evals/p4-2026-10-19.jsonl', 'evals/p4-2026-10-19-run2.jsonl', 'evals/p4-2026-10-19-run3.jsonl']

/** Objects whose keys are data (tool names), not fields: the path stops there. */
export const OPEN_MAPS = ['estimated.toolResultTokensByTool']

/** Dotted paths of every leaf of a JSON value. A path in `openMaps`, an array or a primitive is a leaf. */
export const flattenPaths = (value, openMaps = OPEN_MAPS, prefix = '') => {
  const isObject = value !== null && typeof value === 'object' && !Array.isArray(value)
  if (!isObject || openMaps.includes(prefix)) return prefix ? [prefix] : []
  return Object.entries(value).flatMap(([key, child]) => flattenPaths(child, openMaps, prefix ? `${prefix}.${key}` : key))
}

/**
 * Field paths named by the first cell of each row of the README field table. A path with a dot sets the
 * prefix for the bare names after it in the same cell; a name that starts with a dot reuses that prefix.
 */
export const fieldPathsFromCells = cells => cells.flatMap(cell => {
  let prefix = ''
  return codeSpans(cell).map(span => {
    if (span.startsWith('.')) return `${prefix}${span}`
    const cut = span.lastIndexOf('.')
    prefix = cut === -1 ? prefix : span.slice(0, cut)
    return cut === -1 ? (prefix ? `${prefix}.${span}` : span) : span
  })
})

/** Consecutive pipe-table blocks of a Markdown text. */
export const tables = markdown => {
  const blocks = []
  let current = null
  for (const line of markdown.split('\n')) {
    if (/^\s*\|/.test(line)) (current ??= []).push(line)
    else if (current) { blocks.push(current.join('\n')); current = null }
  }
  if (current) blocks.push(current.join('\n'))
  return blocks
}

/** A number as the docs write it: fixed decimals, `+` for a positive value when `signed`, never `-0`. */
export const formatNumber = (value, decimals, signed = false) => {
  const text = value.toFixed(decimals)
  if (Number(text) === 0) return text.replace('-', '')
  return signed && Number(text) > 0 ? `+${text}` : text
}

/** Fills each `{}` (plain) and `{+}` (signed) of `template` with the next value, at the matching decimals. */
export const expandNeedle = (template, values, decimals) => {
  let index = 0
  return template.replace(/\{\+?\}/g, token => {
    const i = index++
    const value = values[i]
    if (typeof value !== 'number' || Number.isNaN(value)) throw new Error(`no number for placeholder ${i + 1} of "${template}"`)
    return formatNumber(value, Array.isArray(decimals) ? decimals[i] : decimals, token === '{+}')
  })
}

/** Checks each `{ file, needle, metric, decimals }` against `files` ({ path: text }); `metric` gets `context`. */
export const checkNumbers = (table, files, context) => table.flatMap(entry => {
  const text = files[entry.file]
  if (text === undefined) return [`numbers: ${entry.file} was not read`]
  let expected
  try {
    expected = expandNeedle(entry.needle, entry.metric(context), entry.decimals)
  } catch (error) {
    return [`numbers: ${entry.file}: ${error.message}`]
  }
  return text.includes(expected) ? [] : [`numbers: ${entry.file} does not contain "${expected}" (recomputed from the committed runs; "${entry.needle}")`]
})

const mean = values => values.reduce((a, b) => a + b, 0) / values.length
const median = values => {
  const a = [...values].sort((x, y) => x - y)
  const n = a.length
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2
}
const stdev = values => Math.sqrt(values.reduce((s, v) => s + (v - mean(values)) ** 2, 0) / values.length)

const taskMedian = (s, id) => s.tasks.find(t => t.task.startsWith(id)).medianChangePct
const taskPassed = (s, id) => s.tasks.find(t => t.task.startsWith(id))
const TASK_IDS = ['T1-explain', 'T2-locate', 'T3-fix', 'T4-review', 'T5-plan', 'T6-git', 'T7-config', 'T8-fact']

/** Per-task change of the summed output tokens, Concise against default (the "mean of 3" table). */
const taskMeanChange = (rows, id) => {
  const pairs = pairUp(rows).filter(p => p.task === id)
  return (pairs.reduce((a, p) => a + p.c.outputTokens, 0) / pairs.reduce((a, p) => a + p.d.outputTokens, 0) - 1) * 100
}

/** Cell = every valid output-token value of one task and arm in one run. */
const cells = rows => {
  const byCell = new Map()
  for (const r of rows.filter(x => !x.error && x.outputTokens > 0)) {
    const key = `${r.task}|${r.arm}`
    byCell.set(key, [...(byCell.get(key) ?? []), r.outputTokens])
  }
  return byCell
}
/** Median over cells present in both runs of the absolute change of the cell mean. */
const cellShift = (a, b) => {
  const x = cells(a)
  const y = cells(b)
  return median([...x].map(([key, values]) => Math.abs(mean(y.get(key)) / mean(values) - 1))) * 100
}
const repSpread = allRows => median(allRows.flatMap(rows => [...cells(rows).values()]).map(v => stdev(v) / mean(v))) * 100

// The declared table of every measured number the docs quote. A metric gets
// `{ s: [summary per run], rows: [rows per run] }`. `{}` is a plain number, `{+}` a signed one.
// Numbers that cannot be derived from the committed data are listed in the report, not here.
export const NUMBER_TABLE = [
  // README, "Levers" (the Concise output style row).
  { file: 'README.md', needle: 'over {} paired runs: output tokens fell {}% in total', decimals: 0, metric: ({ s }) => [s[0].pairs, -s[0].outputTokens.changePct] },
  { file: 'README.md', needle: 'gave {}% and {}%)', decimals: 0, metric: ({ s }) => [-s[1].outputTokens.changePct, -s[2].outputTokens.changePct] },
  { file: 'README.md', needle: '), {} to {}% on explanations', decimals: 0, metric: ({ s }) => {
    const falls = ['T1', 'T2', 'T4', 'T5', 'T6'].map(id => -taskMedian(s[0], id))
    return [Math.min(...falls), Math.max(...falls)]
  } },
  { file: 'README.md', needle: 'locating code ({}%)', decimals: 0, metric: ({ s }) => [-taskMedian(s[0], 'T2')] },
  { file: 'README.md', needle: 'Cost per run fell only {}%', decimals: 0, metric: ({ s }) => [-s[0].cost.changePct] },

  // evals/results.md, header and the three summary tables.
  { file: 'evals/results.md', needle: '{} tasks, {} reps, {} paired', decimals: 0, metric: ({ s }) => [s[0].tasks.length, s[0].pairs / s[0].tasks.length, s[0].pairs] },
  { file: 'evals/results.md', needle: 'holds only the {} valid runs', decimals: 0, metric: ({ rows }) => [rows[0].length] },
  { file: 'evals/results.md', needle: 'point estimates clear it (total {+}%, median per pair {+}%)', decimals: 1, metric: ({ s }) => [s[0].outputTokens.changePct, s[0].medianPairChangePct.value] },
  { file: 'evals/results.md', needle: 'Total output fell {}% against {}%', decimals: 1, metric: ({ s }) => [-s[1].outputTokens.changePct, -s[0].outputTokens.changePct] },
  { file: 'evals/results.md', needle: "first run's {+}% is best read", decimals: 1, metric: ({ s }) => [s[0].outputTokens.changePct] },
  { file: 'evals/results.md', needle: 'Concise passed T1-explain {} of {} in run 2', decimals: 0, metric: ({ s }) => [taskPassed(s[1], 'T1').passConcise, taskPassed(s[1], 'T1').pairs] },
  { file: 'evals/results.md', needle: 'Run 3 passed {}/{} (default) and {}/{} (Concise)', decimals: 0, metric: ({ s }) => [s[2].passed.default, s[2].pairs, s[2].passed.concise, s[2].pairs] },
  { file: 'evals/results.md', needle: 'went from {+}% to {+}%', decimals: 0, metric: ({ s }) => [taskMedian(s[0], 'T2'), taskMedian(s[1], 'T2')] },
  { file: 'evals/results.md', needle: 'Two runs on the corrected fixture give {+}% and {+}% in total (about {+}%) and {+}% and {+}% median per pair (about {+}%)',
    decimals: [1, 1, 0, 1, 1, 0], metric: ({ s }) => [
      s[1].outputTokens.changePct, s[2].outputTokens.changePct, mean([s[1].outputTokens.changePct, s[2].outputTokens.changePct]),
      s[1].medianPairChangePct.value, s[2].medianPairChangePct.value, mean([s[1].medianPairChangePct.value, s[2].medianPairChangePct.value]),
    ] },
  { file: 'evals/results.md', needle: 'median of {}% (coefficient of variation)', decimals: 0, metric: ({ rows }) => [repSpread(rows)] },
  { file: 'evals/results.md', needle: 'differs between the two runs by a median of {}%', decimals: 0, metric: ({ rows }) => [cellShift(rows[0], rows[1])] },
  { file: 'evals/results.md', needle: '(run 2 to run 3) is {}%', decimals: 0, metric: ({ rows }) => [cellShift(rows[1], rows[2])] },
  { file: 'evals/results.md', needle: 'Between run 1 and run 2 it was {}%, and between run 1 and run 3 it was {}%', decimals: 0, metric: ({ rows }) => [cellShift(rows[0], rows[1]), cellShift(rows[0], rows[2])] },

  // evals/results.md, run 1 and run 2 tables (the same rows `summarize.mjs` prints).
  ...[[0, 'Checks passed'], [1, 'Checks passed, as recorded']].flatMap(([run, checks]) => [
    { file: 'evals/results.md', needle: '| Output tokens, total | {} | {} | {+}% (95% interval {+}% to {+}%) |', decimals: [0, 0, 1, 1, 1],
      metric: ({ s }) => [s[run].outputTokens.default, s[run].outputTokens.concise, s[run].outputTokens.changePct, ...s[run].outputTokens.intervalPct] },
    { file: 'evals/results.md', needle: '| Output tokens, median per pair | | | {+}% (95% interval {+}% to {+}%) |', decimals: 1,
      metric: ({ s }) => [s[run].medianPairChangePct.value, ...s[run].medianPairChangePct.intervalPct] },
    { file: 'evals/results.md', needle: '| Visible answer characters | {} | {} | {+}% |', decimals: [0, 0, 1],
      metric: ({ s }) => [s[run].visibleChars.default, s[run].visibleChars.concise, s[run].visibleChars.changePct] },
    { file: 'evals/results.md', needle: '| Thinking tokens | {} | {} | {+}% |', decimals: [0, 0, 1],
      metric: ({ s }) => [s[run].thinkingTokens.default, s[run].thinkingTokens.concise, s[run].thinkingTokens.changePct] },
    { file: 'evals/results.md', needle: '| Cost (USD) | {} | {} | {+}% |', decimals: [2, 2, 1],
      metric: ({ s }) => [s[run].cost.default, s[run].cost.concise, s[run].cost.changePct] },
    { file: 'evals/results.md', needle: `| ${checks} | {}/{} | {}/{} |`, decimals: 0,
      metric: ({ s }) => [s[run].passed.default, s[run].pairs, s[run].passed.concise, s[run].pairs] },
    { file: 'evals/results.md', needle: 'Concise gave fewer output tokens in {} of {} pairs (range {+}% to {+}%).', decimals: [0, 0, 1, 1],
      metric: ({ s }) => [s[run].medianPairChangePct.conciseLower, s[run].pairs, s[run].medianPairChangePct.min, s[run].medianPairChangePct.max] },
  ]),
  { file: 'evals/results.md', needle: 'It cost ${}, billed to the `ANTHROPIC_API_KEY` credential (`claude auth status`', decimals: 2, metric: ({ s }) => [s[1].cost.default + s[1].cost.concise] },
  { file: 'evals/results.md', needle: 'It cost ${}, billed to the `ANTHROPIC_API_KEY` credential. Reproduce', decimals: 2, metric: ({ s }) => [s[2].cost.default + s[2].cost.concise] },

  // evals/results.md, "Third run": the three-run summary table.
  { file: 'evals/results.md', needle: '| 1 | Original (included `.claude/CLAUDE.md`) | {+}% | {+}% | {} of {} | ${} |', decimals: [1, 1, 0, 0, 2],
    metric: ({ s }) => [s[0].outputTokens.changePct, s[0].medianPairChangePct.value, s[0].medianPairChangePct.conciseLower, s[0].pairs, s[0].cost.default + s[0].cost.concise] },
  { file: 'evals/results.md', needle: '| 2 | Corrected | {+}% | {+}% | {} of {} | ${} |', decimals: [1, 1, 0, 0, 2],
    metric: ({ s }) => [s[1].outputTokens.changePct, s[1].medianPairChangePct.value, s[1].medianPairChangePct.conciseLower, s[1].pairs, s[1].cost.default + s[1].cost.concise] },
  { file: 'evals/results.md', needle: '| 3 | Corrected, same content as run 2 | {+}% (interval {+}% to {+}%) | {+}% (interval {+}% to {+}%) | {} of {} | ${} |', decimals: [1, 1, 1, 1, 1, 1, 0, 0, 2],
    metric: ({ s }) => [s[2].outputTokens.changePct, ...s[2].outputTokens.intervalPct, s[2].medianPairChangePct.value, ...s[2].medianPairChangePct.intervalPct, s[2].medianPairChangePct.conciseLower, s[2].pairs, s[2].cost.default + s[2].cost.concise] },

  // evals/results.md, per-task tables.
  ...TASK_IDS.map(id => ({ file: 'evals/results.md', needle: `| ${id} | {+}% | {+}% |\n`, decimals: 1, metric: ({ s }) => [taskMedian(s[0], id.slice(0, 2)), taskMedian(s[1], id.slice(0, 2))] })),
  ...TASK_IDS.map(id => ({ file: 'evals/results.md', needle: `| ${id} | {+}% | {+}% | {+}% |`, decimals: 0, metric: ({ rows }) => rows.map(r => taskMeanChange(r, id)) })),
  { file: 'evals/results.md', needle: 'T6-git ({+}%, {+}%), T1-explain ({+}%, {+}%) and T5-plan ({+}%, {+}%)', decimals: 0,
    metric: ({ rows }) => ['T6-git', 'T1-explain', 'T5-plan'].flatMap(id => [taskMeanChange(rows[1], id), taskMeanChange(rows[2], id)]) },
  { file: 'evals/results.md', needle: 'T4-review ({+}%, {+}%) and T8-fact ({+}%, {+}%)', decimals: 0,
    metric: ({ rows }) => ['T4-review', 'T8-fact'].flatMap(id => [taskMeanChange(rows[1], id), taskMeanChange(rows[2], id)]) },
  // UNVERIFIED.md, closed items 14, 17 and 19 (the same runs, in prose).
  { file: 'UNVERIFIED.md', needle: 'Output tokens: **{+}% in total** (', decimals: 1, metric: ({ s }) => [s[0].outputTokens.changePct] },
  { file: 'UNVERIFIED.md', needle: 'bootstrap 95% interval {+}% to {+}%)', decimals: 1, metric: ({ s }) => s[0].outputTokens.intervalPct },
  { file: 'UNVERIFIED.md', needle: 'median per-pair change **{+}%** (interval {+}% to {+}%), lower in {} of {} pairs', decimals: [1, 1, 1, 0, 0],
    metric: ({ s }) => [s[0].medianPairChangePct.value, ...s[0].medianPairChangePct.intervalPct, s[0].medianPairChangePct.conciseLower, s[0].pairs] },
  { file: 'UNVERIFIED.md', needle: 'Visible answer text {+}% in characters', decimals: 1, metric: ({ s }) => [s[0].visibleChars.changePct] },
  { file: 'UNVERIFIED.md', needle: 'Cost {+}% (${} to ${})', decimals: [1, 2, 2], metric: ({ s }) => [s[0].cost.changePct, s[0].cost.default, s[0].cost.concise] },
  ...[[1, 'Output tokens {+}% in total'], [2, '**Mostly the fixture.** Run 3: output tokens {+}% in total']].map(([run, lead]) => ({
    file: 'UNVERIFIED.md', needle: `${lead} (interval {+}% to {+}%), median per pair {+}% (interval {+}% to {+}%), {} of {} pairs lower`, decimals: [1, 1, 1, 1, 1, 1, 0, 0],
    metric: ({ s }) => [s[run].outputTokens.changePct, ...s[run].outputTokens.intervalPct, s[run].medianPairChangePct.value, ...s[run].medianPairChangePct.intervalPct, s[run].medianPairChangePct.conciseLower, s[run].pairs],
  })),
  { file: 'UNVERIFIED.md', needle: '; cost {+}%; ${}.', decimals: [1, 2], metric: ({ s }) => [s[1].cost.changePct, s[1].cost.default + s[1].cost.concise] },
  { file: 'UNVERIFIED.md', needle: '20 of 24 pairs lower, ${}.', decimals: 2, metric: ({ s }) => [s[2].cost.default + s[2].cost.concise] },
  { file: 'UNVERIFIED.md', needle: 'the reps differ by a median {}%, and the same cell differs between run 1 and run 2 by a median {}%', decimals: 0, metric: ({ rows }) => [repSpread(rows), cellShift(rows[0], rows[1])] },
  { file: 'UNVERIFIED.md', needle: 'by a median {}%, against {}% between run 1 and run 2 and {}% between run 1 and run 3', decimals: 0, metric: ({ rows }) => [cellShift(rows[1], rows[2]), cellShift(rows[0], rows[1]), cellShift(rows[0], rows[2])] },
  { file: 'UNVERIFIED.md', needle: 'T4-review ({+}%, {+}%) and T8-fact ({+}%, {+}%)', decimals: 0, metric: ({ rows }) => ['T4-review', 'T8-fact'].flatMap(id => [taskMeanChange(rows[1], id), taskMeanChange(rows[2], id)]) },
  { file: 'UNVERIFIED.md', needle: 'about {+}% in total and {+}% median per pair', decimals: 0,
    metric: ({ s }) => [mean([s[1].outputTokens.changePct, s[2].outputTokens.changePct]), mean([s[1].medianPairChangePct.value, s[2].medianPairChangePct.value])] },
]

const loadRows = (root, file) => readFileSync(join(root, file), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))

const sourceFlags = (source, pattern) => [...source.matchAll(pattern)].map(match => match[1])

/** Counts-only transcript with every kind of block `measure()` reads, so every output field is present. */
const fixtureTranscript = () => {
  const usage = (output, thinking) => ({ input_tokens: 1, cache_read_input_tokens: 100, cache_creation_input_tokens: 10, output_tokens: output, output_tokens_details: { thinking_tokens: thinking } })
  return [
    { type: 'assistant', uuid: 'a', message: { id: 'a', usage: usage(100, 40), content: [{ type: 'tool_use', id: 't1', name: 'Bash' }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'x'.repeat(9000) }] } },
    { type: 'assistant', uuid: 'b', message: { id: 'b', usage: usage(50, 10), content: [] } },
  ].map(row => JSON.stringify(row)).join('\n') + '\n'
}

const measureFieldPaths = () => {
  const dir = mkdtempSync(join(tmpdir(), 'm3l-og-parity-'))
  try {
    const file = join(dir, 's.jsonl')
    writeFileSync(file, fixtureTranscript())
    return flattenPaths(measure([file]))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const headerStartsWith = (table, text) => table.split('\n')[0].replaceAll('`', '').trim().startsWith(`| ${text}`)

const check = async ({ root }) => {
  const problems = []
  const read = file => readFileSync(join(root, file), 'utf8')
  const readme = read('README.md')
  const measureSource = read('scripts/measure.mjs')
  const p4Source = read('evals/p4.mjs')

  // measure.mjs arguments.
  const cli = section(readme, 'Measure from the command line') ?? ''
  const argTable = tables(cli).find(table => headerStartsWith(table, 'Argument'))
  const fieldTable = tables(cli).find(table => headerStartsWith(table, 'Field'))
  if (!argTable || !fieldTable) problems.push('README: "Measure from the command line" must hold an Argument table and a Field table')
  else {
    const rows = tableColumn(argTable, 0)
    const docFlags = rows.flatMap(cell => codeSpans(cell)).map(span => span.split(' ')[0]).filter(span => span.startsWith('--'))
    problems.push(...assertSameSet('measure.mjs flags', docFlags, sourceFlags(measureSource, /'(--[a-z-]+)'/g)))
    const gateRow = tableColumn(argTable, 1)[rows.findIndex(cell => cell.includes('--gate'))] ?? ''
    problems.push(...assertSame('measure.mjs --gate default', /default (\d+)/.exec(gateRow)?.[1], DEFAULT_GATE_CHARS))

    problems.push(...assertSameSet('measure.mjs output fields', fieldPathsFromCells(tableColumn(fieldTable, 0)), measureFieldPaths()))
  }

  // p4.mjs flags, defaults and task count.
  const p4Section = section(readme, 'Working on this repo') ?? ''
  const p4Table = tables(p4Section).find(table => headerStartsWith(table, 'evals/p4.mjs flag'))
  if (!p4Table) problems.push('README: "Working on this repo" must hold the `evals/p4.mjs` flag table')
  else {
    const flagCells = tableColumn(p4Table, 0)
    const docFlags = flagCells.map(cell => codeSpans(cell)[0]?.split(' ')[0])
    const argNames = sourceFlags(p4Source, /\barg\('([\w-]+)'/g).map(name => `--${name}`)
    const codeFlags = [...(p4Source.includes("includes('--live')") ? ['--live'] : []), ...argNames]
    problems.push(...assertSameSet('p4.mjs flags', docFlags, codeFlags))

    const literals = Object.fromEntries([...p4Source.matchAll(/\barg\('([\w-]+)',\s*'([^']*)'\)/g)].map(match => [`--${match[1]}`, match[2]]))
    const outDefault = /\barg\('out',\s*join\(outDir, `p4-\$\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}\.jsonl`\)\)/.test(p4Source) && /outDir = join\(here, '\.results'\)/.test(p4Source)
      ? 'evals/.results/p4-<UTC date>.jsonl'
      : 'unrecognised'
    const codeDefaults = { '--live': 'off', '--reps': literals['--reps'], '--tasks': `${literals['--tasks']} ${TASKS.length}`, '--arms': literals['--arms'], '--max-spend': literals['--max-spend'], '--out': outDefault }
    const docDefaults = tableColumn(p4Table, 1)
    docFlags.forEach((flag, i) => {
      if (flag in codeDefaults) problems.push(...assertSame(`p4.mjs ${flag} default`, (docDefaults[i] ?? '').replaceAll('`', ''), codeDefaults[flag]))
    })

    const budget = /'--max-budget-usd', '(\d+)'/.exec(p4Source)?.[1]
    const timeout = /RUN_TIMEOUT_MS = ([\d_]+)/.exec(p4Source)?.[1]
    problems.push(...assertSame('p4.mjs per-run budget', /`--max-budget-usd (\d+)`/.exec(p4Section)?.[1], budget))
    problems.push(...assertSame('p4.mjs per-run timeout (seconds)', /and (\d+) seconds/.exec(p4Section)?.[1], Number(timeout?.replaceAll('_', '')) / 1000))

    const model = /const MODEL = '([^']+)'/.exec(p4Source)?.[1]
    const effort = /const EFFORT = '([^']+)'/.exec(p4Source)?.[1]
    const results = read('evals/results.md')
    for (const [name, text] of [['README.md', readme], ['evals/results.md', results]]) {
      if (!text.includes(`\`${effort}\``)) problems.push(`p4.mjs EFFORT: ${name} never names effort \`${effort}\``)
    }
    if (!results.includes(`\`${model}\``)) problems.push(`p4.mjs MODEL: evals/results.md never names \`${model}\``)
    const marketing = model?.replace(/^claude-(\w)(\w*)-(\d+)-(\d+)$/, (_, a, rest, major, minor) => `${a.toUpperCase()}${rest} ${major}.${minor}`)
    if (!readme.includes(marketing ?? '?')) problems.push(`p4.mjs MODEL: README.md never names ${marketing}`)

    // The dry run is the only child process: it spawns no claude session and says so.
    const { NODE_TEST_CONTEXT, ...env } = process.env
    const dry = spawnSync('node', [join(root, 'evals/p4.mjs')], { cwd: root, encoding: 'utf8', env })
    if (dry.status !== 0 || !dry.stdout.includes('Dry run: nothing was spawned')) problems.push('p4.mjs: the default invocation is no longer a dry run, so the plan numbers cannot be checked')
    else {
      const runs = /= (\d+) runs/.exec(dry.stdout)?.[1]
      const cost = /Estimated cost: about \$([\d.]+)/.exec(dry.stdout)?.[1]
      problems.push(...assertSame('p4.mjs dry-run plan', /\((\d+) runs, about \$([\d.]+)\)/.exec(readme)?.slice(1).join(' '), `${runs} ${cost}`))
    }
  }
  const taskCount = /(\d+) tasks,/.exec(read('evals/results.md'))?.[1]
  problems.push(...assertSame('p4.mjs TASKS in evals/results.md', taskCount, TASKS.length))
  const rowSets = new Set(RUN_FILES.flatMap(file => loadRows(root, file)).map(row => Object.keys(row).length))
  const rowFields = /Each row holds (\d+) count and flag fields/.exec(readme)?.[1]
  if (rowSets.size !== 1) problems.push(`result rows: the committed runs hold rows of differing key counts (${[...rowSets].join(', ')})`)
  else problems.push(...assertSame('result-row fields in README', rowFields, [...rowSets][0]))

  // The measured numbers.
  const rows = RUN_FILES.map(file => loadRows(root, file))
  const summaries = rows.map(summarize)
  const files = Object.fromEntries(['README.md', 'evals/results.md', 'UNVERIFIED.md'].map(file => [file, read(file)]))
  problems.push(...checkNumbers(NUMBER_TABLE, files, { s: summaries, rows }))

  // The skill invocation: plugin name plus the skills/ directory name.
  const pluginName = JSON.parse(read('.claude-plugin/plugin.json')).name
  const skillDirs = readdirSync(join(root, 'skills'), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)
  const invoked = new Set()
  const skill = read('skills/measure/SKILL.md')
  for (const text of [readme, skill]) for (const match of text.matchAll(/\/([a-z0-9-]+):([a-z0-9-]+)/g)) invoked.add(`/${match[1]}:${match[2]}`)
  problems.push(...assertSameSet('skill invocations', invoked, skillDirs.map(dir => `/${pluginName}:${dir}`)))
  problems.push(...assertSame('skill name in SKILL.md frontmatter', /^name: (.+)$/m.exec(skill)?.[1], 'measure'))
  if (!/^disable-model-invocation: true$/m.test(skill)) problems.push('skills/measure/SKILL.md must keep `disable-model-invocation: true` (it reads session history)')
  return problems
}

export default check

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const problems = await check({ root })
  if (problems.length === 0) console.log('  ok  documentation and code agree')
  else {
    for (const problem of problems) console.error(`  fail  ${problem}`)
    process.exitCode = 1
  }
}
