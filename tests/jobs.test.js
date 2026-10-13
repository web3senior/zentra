import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cleanBrief, decodeJobLogs, jobStatus } from '../src/lib/zentra/jobs'
// HupTasks' logs on LUKSO as the explorer returned them on 2026-10-13 (the contract is unverified,
// so they come undecoded): two tasks, one paid in full and one reclaimed after four payouts
const logs = JSON.parse(readFileSync(new URL('./fixtures/huptasks-lukso-logs.json', import.meta.url), 'utf8'))
test('recorded HupTasks logs decode into tasks, payouts and closings', () => {
  const { posted, payouts, closed } = decodeJobLogs(logs)
  assert.deepEqual(posted.map((p) => p.post).sort(), ['5781', '5880'])
  assert.equal(payouts.filter((p) => p.post === '5781').length, 5)
  assert.equal(payouts.filter((p) => p.post === '5880').length, 4)
  assert.ok(payouts.every((p) => p.amount === '5000000000000000000' && p.agentId === '0'))
  assert.equal(closed.get('5880'), 'reclaimed')
  assert.equal(closed.has('5781'), false)
})
test('logs that are not task events are skipped', () => {
  const { posted, payouts, closed } = decodeJobLogs([{ topics: ['0x' + 'ab'.repeat(32)], data: '0x' }])
  assert.equal(posted.length + payouts.length + closed.size, 0)
})
test('status: open until the deadline, in review after it, done when paid or closed', () => {
  const deadline = 1_800_000_000, before = (deadline - 1) * 1000, after = deadline * 1000
  assert.equal(jobStatus({ closed: '', paid: 2, slots: 5, deadline }, before), 'open')
  assert.equal(jobStatus({ closed: '', paid: 2, slots: 5, deadline }, after), 'review')
  assert.equal(jobStatus({ closed: '', paid: 5, slots: 5, deadline }, before), 'done')
  assert.equal(jobStatus({ closed: 'reclaimed', paid: 4, slots: 5, deadline }, after), 'done')
})
test('briefs are capped plain text from the first text element', () => {
  const brief = cleanBrief({ version: '1', elements: [{ type: 'image', data: {} }, { type: 'text', data: { text: `**TASK:**\u0000 <b>name</b>\n\n${'x'.repeat(900)}` } }] })
  assert.ok(brief.startsWith('TASK: <b>name</b> x'))
  assert.ok(brief.length <= 400)
  assert.ok(!brief.includes('\u0000') && !brief.includes('*'))
  assert.equal(cleanBrief({ elements: [] }), null)
  assert.equal(cleanBrief('not a post'), null)
  assert.equal(cleanBrief({ elements: [{ type: 'text', data: { text: 42 } }] }), null)
})
