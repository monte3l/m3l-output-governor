// Summarises P4 result rows (one JSON object per line) into counts and a seeded bootstrap interval.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const BOOTSTRAP_RESAMPLES = 5000
const BOOTSTRAP_SEED = 12345

const median = values => {
  const a = [...values].sort((x, y) => x - y)
  const n = a.length
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2
}
const sum = (rows, key) => rows.reduce((total, r) => total + (r[key] ?? 0), 0)
const change = (from, to) => (to / from - 1) * 100

/** Rows that finished: an errored run (for example a spend-limit 400) carries no tokens and is excluded. */
export const validRows = rows => rows.filter(r => !r.error && r.outputTokens > 0)

/** Pairs a default row with a concise row of the same task and rep. */
export const pairUp = rows => {
  const byKey = new Map(validRows(rows).map(r => [`${r.task}|${r.rep}|${r.arm}`, r]))
  const pairs = []
  for (const r of byKey.values()) {
    if (r.arm !== 'default') continue
    const concise = byKey.get(`${r.task}|${r.rep}|concise`)
    if (concise) pairs.push({ task: r.task, rep: r.rep, d: r, c: concise })
  }
  return pairs
}

const bootstrap = pairs => {
  let seed = BOOTSTRAP_SEED
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296
  const totals = []
  const medians = []
  for (let b = 0; b < BOOTSTRAP_RESAMPLES; b++) {
    let d = 0
    let c = 0
    const changes = []
    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[Math.floor(random() * pairs.length)]
      d += p.d.outputTokens
      c += p.c.outputTokens
      changes.push(change(p.d.outputTokens, p.c.outputTokens))
    }
    totals.push(change(d, c))
    medians.push(median(changes))
  }
  const interval = values => {
    const a = [...values].sort((x, y) => x - y)
    return [a[Math.floor(a.length * 0.025)], a[Math.floor(a.length * 0.975)]]
  }
  return { total: interval(totals), median: interval(medians) }
}

export const summarize = rows => {
  const pairs = pairUp(rows)
  if (!pairs.length) return { pairs: 0 }
  const defaults = pairs.map(p => p.d)
  const concises = pairs.map(p => p.c)
  const perPair = pairs.map(p => change(p.d.outputTokens, p.c.outputTokens)).sort((a, b) => a - b)
  const tasks = [...new Set(pairs.map(p => p.task))].sort().map(task => {
    const group = pairs.filter(p => p.task === task)
    return {
      task,
      pairs: group.length,
      medianChangePct: median(group.map(p => change(p.d.outputTokens, p.c.outputTokens))),
      passDefault: group.filter(p => p.d.pass).length,
      passConcise: group.filter(p => p.c.pass).length,
    }
  })
  const totals = key => [sum(defaults, key), sum(concises, key)]
  const output = totals('outputTokens')
  const chars = totals('resultChars')
  const thinking = totals('thinkingTokens')
  const cost = totals('cost')
  const interval = bootstrap(pairs)
  return {
    pairs: pairs.length,
    outputTokens: { default: output[0], concise: output[1], changePct: change(...output), intervalPct: interval.total },
    medianPairChangePct: { value: median(perPair), intervalPct: interval.median, conciseLower: perPair.filter(x => x < 0).length, min: perPair[0], max: perPair[perPair.length - 1] },
    visibleChars: { default: chars[0], concise: chars[1], changePct: change(...chars) },
    thinkingTokens: { default: thinking[0], concise: thinking[1], changePct: change(...thinking) },
    cost: { default: cost[0], concise: cost[1], changePct: change(...cost) },
    passed: { default: defaults.filter(r => r.pass).length, concise: concises.filter(r => r.pass).length },
    tasks,
    excludedErrorRuns: rows.length - validRows(rows).length,
  }
}

const pct = n => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`

export const toMarkdown = s => {
  if (!s.pairs) return 'No complete pairs.\n'
  const [lo, hi] = s.outputTokens.intervalPct
  const [mlo, mhi] = s.medianPairChangePct.intervalPct
  return [
    `Pairs: ${s.pairs}. Errored runs excluded: ${s.excludedErrorRuns}.`,
    '',
    '| Measure | Default | Concise | Change |',
    '| --- | --- | --- | --- |',
    `| Output tokens, total | ${s.outputTokens.default} | ${s.outputTokens.concise} | ${pct(s.outputTokens.changePct)} (95% interval ${pct(lo)} to ${pct(hi)}) |`,
    `| Output tokens, median per pair | | | ${pct(s.medianPairChangePct.value)} (95% interval ${pct(mlo)} to ${pct(mhi)}) |`,
    `| Visible answer characters | ${s.visibleChars.default} | ${s.visibleChars.concise} | ${pct(s.visibleChars.changePct)} |`,
    `| Thinking tokens | ${s.thinkingTokens.default} | ${s.thinkingTokens.concise} | ${pct(s.thinkingTokens.changePct)} |`,
    `| Cost (USD) | ${s.cost.default.toFixed(2)} | ${s.cost.concise.toFixed(2)} | ${pct(s.cost.changePct)} |`,
    `| Checks passed | ${s.passed.default}/${s.pairs} | ${s.passed.concise}/${s.pairs} | |`,
    '',
    `Concise gave fewer output tokens in ${s.medianPairChangePct.conciseLower} of ${s.pairs} pairs (range ${pct(s.medianPairChangePct.min)} to ${pct(s.medianPairChangePct.max)}).`,
    '',
    '| Task | Pairs | Median output change | Passed (default, Concise) |',
    '| --- | --- | --- | --- |',
    ...s.tasks.map(t => `| ${t.task} | ${t.pairs} | ${pct(t.medianChangePct)} | ${t.passDefault}/${t.pairs}, ${t.passConcise}/${t.pairs} |`),
    '',
  ].join('\n')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: summarize.mjs <results.jsonl>')
    process.exit(2)
  }
  const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  process.stdout.write(toMarkdown(summarize(rows)))
}
