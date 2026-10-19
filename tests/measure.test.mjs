import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expandPaths, measure, projectDir } from '../scripts/measure.mjs'

const MEASURE = fileURLToPath(new URL('../scripts/measure.mjs', import.meta.url))
const SECRET = 'sk-ant-SECRET-PROMPT-TEXT'

const assistant = (id, usage, content) => ({ type: 'assistant', uuid: id, message: { id, usage, content } })
const result = (toolUseId, text) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: toolUseId, content: text }] } })

const transcript = rows => {
  const file = join(mkdtempSync(join(tmpdir(), 'm3l-og-')), 's.jsonl')
  writeFileSync(file, rows.map(r => JSON.stringify(r)).join('\n') + '\nnot json\n')
  return file
}

const usage = (output, thinking) => ({ input_tokens: 1, cache_read_input_tokens: 100, cache_creation_input_tokens: 10, output_tokens: output, output_tokens_details: { thinking_tokens: thinking } })

test('sums exact usage and splits thinking from the rest of the output', () => {
  const file = transcript([
    assistant('a', usage(100, 40), [{ type: 'tool_use', id: 't1', name: 'Bash' }]),
    result('t1', 'x'.repeat(9000)),
    assistant('b', usage(50, 10), [{ type: 'text', text: SECRET }]),
  ])
  const m = measure([file])
  assert.equal(m.requests, 2)
  assert.equal(m.exact.output, 150)
  assert.equal(m.exact.thinking, 50)
  assert.equal(m.exact.textAndToolUse, 100)
  assert.equal(m.exact.thinkingShareOfOutput, 0.333)
})

test('counts a duplicated assistant message id once', () => {
  const row = assistant('a', usage(100, 40), [])
  const m = measure([transcript([row, row])])
  assert.equal(m.requests, 1)
  assert.equal(m.exact.output, 100)
})

test('only Bash results at or over the gate are counted, and re-reads follow the result', () => {
  const file = transcript([
    assistant('a', usage(1, 0), [{ type: 'tool_use', id: 't1', name: 'Bash' }, { type: 'tool_use', id: 't2', name: 'Read' }]),
    result('t1', 'x'.repeat(8000)),
    result('t2', 'y'.repeat(8000)),
    assistant('b', usage(1, 0), []),
    assistant('c', usage(1, 0), []),
  ])
  const m = measure([file])
  assert.equal(m.estimated.bashOverGate, 1)
  assert.equal(m.estimated.rereadTokens.bashOverGate, 4000) // 8000 chars / 4, re-read by 2 later requests
  assert.equal(measure([file], { gateChars: 8001 }).estimated.bashOverGate, 0)
})

test('output carries counts only, never transcript text', () => {
  const file = transcript([
    assistant('a', usage(1, 0), [{ type: 'tool_use', id: 't1', name: 'Bash' }]),
    result('t1', SECRET.repeat(1000)),
  ])
  assert.ok(!JSON.stringify(measure([file])).includes('SECRET'))
})

test('skips unreadable files and malformed lines', () => {
  const m = measure(['/nonexistent/x.jsonl', transcript([assistant('a', usage(5, 0), [])])])
  assert.equal(m.sessions, 1)
  assert.equal(m.exact.output, 5)
})

test('a directory argument expands to its .jsonl files, sorted, and other arguments pass through', () => {
  const dir = mkdtempSync(join(tmpdir(), 'm3l-og-dir-'))
  writeFileSync(join(dir, 'b.jsonl'), '')
  writeFileSync(join(dir, 'a.jsonl'), '')
  writeFileSync(join(dir, 'notes.txt'), '')
  mkdirSync(join(dir, 'sub.jsonl'))
  assert.deepEqual(expandPaths([dir]).map(p => p.slice(dir.length + 1)), ['a.jsonl', 'b.jsonl'])
  assert.deepEqual(expandPaths(['/nonexistent/x.jsonl']), ['/nonexistent/x.jsonl'])
  assert.deepEqual(expandPaths([join(dir, 'a.jsonl')]), [join(dir, 'a.jsonl')])
})

test('projectDir maps a working directory to its transcript folder', () => {
  assert.equal(projectDir('/Users/me/workspaces/monte3l/m3l-output-governor', '/home'), '/home/.claude/projects/-Users-me-workspaces-monte3l-m3l-output-governor')
  assert.equal(projectDir('/Users/me/.claude/x y', '/home'), '/home/.claude/projects/-Users-me--claude-x-y')
})

test('a directory argument also expands to each session\'s subagent transcripts, and measure counts them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'm3l-og-sub-'))
  const row = JSON.stringify(assistant('a', usage(5, 0), []))
  writeFileSync(join(dir, 's1.jsonl'), row)
  mkdirSync(join(dir, 's1', 'subagents'), { recursive: true })
  writeFileSync(join(dir, 's1', 'subagents', 'agent-x.jsonl'), JSON.stringify(assistant('b', usage(7, 0), [])))
  writeFileSync(join(dir, 's1', 'subagents', 'notes.txt'), '')
  const files = expandPaths([dir])
  assert.deepEqual(files.map(p => p.slice(dir.length + 1)), ['s1.jsonl', join('s1', 'subagents', 'agent-x.jsonl')])
  const m = measure(files)
  assert.equal(m.sessions, 2)
  assert.equal(m.subagentFiles, 1)
  assert.equal(m.exact.output, 12)
})

test('the CLI rejects unknown flags, and exits 2 when no path is readable without printing the path', () => {
  for (const args of [['--help'], ['--gate=4000', 'x.jsonl'], ['--gate', '0', 'x.jsonl']]) {
    assert.equal(spawnSync('node', [MEASURE, ...args], { encoding: 'utf8' }).status, 2, args.join(' '))
  }
  const r = spawnSync('node', [MEASURE, `/nonexistent/${SECRET}.jsonl`], { encoding: 'utf8' })
  assert.equal(r.status, 2)
  assert.match(r.stderr, /skipped: 1 unreadable path\(s\)/)
  assert.ok(!r.stdout.includes('SECRET') && !r.stderr.includes('SECRET'))
})
