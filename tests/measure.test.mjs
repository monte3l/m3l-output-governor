import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { measure } from '../scripts/measure.mjs'

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
