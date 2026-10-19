// Offline token baseline from Claude Code session transcripts.
// Reads local JSONL files and prints counts only, never prompt text, tool output or paths.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_GATE_CHARS = 8000
const CHARS_PER_TOKEN = 4

const textOf = c => (typeof c === 'string' ? c : Array.isArray(c) ? c.map(b => b.text ?? '').join('') : '')
const estTokens = chars => Math.round(chars / CHARS_PER_TOKEN)

const parse = file => {
  try {
    return readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      })
      .filter(Boolean)
  } catch {
    return null
  }
}

/** Where Claude Code keeps a project's transcripts: the working directory with every non-alphanumeric character as `-`. */
export const projectDir = (cwd, home = homedir()) => join(home, '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'))

/** A directory argument stands for the `.jsonl` transcripts directly inside it; a file argument stands for itself. */
export const expandPaths = args =>
  args.flatMap(arg => {
    try {
      if (!statSync(arg).isDirectory()) return [arg]
      return readdirSync(arg)
        .filter(name => name.endsWith('.jsonl') && statSync(join(arg, name)).isFile())
        .sort()
        .map(name => join(arg, name))
    } catch {
      return [arg]
    }
  })

/** Totals over the given transcripts. Exact: usage fields. Estimated: anything derived from characters. */
export const measure = (files, { gateChars = DEFAULT_GATE_CHARS } = {}) => {
  const t = {
    sessions: 0, requests: 0, input: 0, cacheRead: 0, cacheCreate: 0, output: 0, thinking: 0,
    resultChars: {}, bashCount: 0, bashMaxChars: 0, bashReread: 0,
    gateCount: 0, gateChars: 0, gateReread: 0, allReread: 0,
  }

  for (const file of files) {
    const rows = parse(file)
    if (!rows) continue
    t.sessions++
    const toolName = new Map()
    const seen = new Set()
    const results = []
    let req = 0

    for (const o of rows) {
      if (o.type === 'assistant' && o.message?.usage) {
        const key = o.message.id ?? o.uuid
        if (!seen.has(key)) {
          seen.add(key)
          const u = o.message.usage
          t.requests++
          req++
          t.input += u.input_tokens ?? 0
          t.cacheRead += u.cache_read_input_tokens ?? 0
          t.cacheCreate += u.cache_creation_input_tokens ?? 0
          t.output += u.output_tokens ?? 0
          t.thinking += u.output_tokens_details?.thinking_tokens ?? 0
        }
        for (const b of o.message.content ?? []) if (b.type === 'tool_use') toolName.set(b.id, b.name)
      } else if (o.type === 'user' && Array.isArray(o.message?.content)) {
        for (const b of o.message.content) {
          if (b.type !== 'tool_result') continue
          const tool = toolName.get(b.tool_use_id) ?? 'unknown'
          const chars = textOf(b.content).length
          t.resultChars[tool] = (t.resultChars[tool] ?? 0) + chars
          results.push({ tool, chars, at: req })
        }
      }
    }

    for (const r of results) {
      // Later requests re-read this result; compaction is ignored, so this overstates.
      const later = Math.max(0, req - r.at)
      t.allReread += r.chars * later
      if (r.tool !== 'Bash') continue
      t.bashCount++
      t.bashMaxChars = Math.max(t.bashMaxChars, r.chars)
      t.bashReread += r.chars * later
      if (r.chars >= gateChars) {
        t.gateCount++
        t.gateChars += r.chars
        t.gateReread += r.chars * later
      }
    }
  }

  const billedInput = t.input + t.cacheRead + t.cacheCreate
  const byTool = Object.entries(t.resultChars)
    .map(([k, v]) => [k, estTokens(v)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  return {
    sessions: t.sessions,
    requests: t.requests,
    exact: {
      input: t.input, cacheRead: t.cacheRead, cacheCreate: t.cacheCreate,
      output: t.output, thinking: t.thinking, textAndToolUse: t.output - t.thinking,
      thinkingShareOfOutput: +(t.thinking / Math.max(1, t.output)).toFixed(3),
    },
    estimated: {
      gateChars,
      bashResults: t.bashCount,
      bashMaxChars: t.bashMaxChars,
      bashOverGate: t.gateCount,
      bashOverGateTokens: estTokens(t.gateChars),
      rereadTokens: { allToolResults: estTokens(t.allReread), bash: estTokens(t.bashReread), bashOverGate: estTokens(t.gateReread) },
      bashOverGateShareOfBilledInput: +(estTokens(t.gateReread) / Math.max(1, billedInput)).toFixed(3),
      toolResultTokensByTool: Object.fromEntries(byTool),
    },
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2)
  const i = args.indexOf('--gate')
  const gateChars = i >= 0 ? Number(args.splice(i, 2)[1]) : DEFAULT_GATE_CHARS
  const p = args.indexOf('--project')
  if (p >= 0) args.splice(p, 1, projectDir(process.cwd()))
  if (!args.length || !Number.isFinite(gateChars) || gateChars <= 0) {
    console.error('usage: measure.mjs [--gate <chars>] [--project] <transcript.jsonl or project directory…>')
    process.exit(2)
  }
  console.log(JSON.stringify(measure(expandPaths(args), { gateChars }), null, 2))
}
