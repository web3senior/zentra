import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chatReply, chatTool, cleanTool } from '../src/lib/zentra/mcp'

const tool = (name, extra = {}) => cleanTool({ name, description: '', inputSchema: { type: 'object', properties: {} }, ...extra })

test('lookups and chat tools can be run; tools that act cannot', () => {
  for (const name of ['get_environment', 'list_tokens', 'resolve_ens', 'search', 'chat', 'ask_question', 'echo'])
    assert.equal(tool(name).callable, true, name)
  for (const name of ['trigger_irrigation', 'set_light_intensity', 'control_exhaust', 'send_payment', 'log_observation', 'capture_image', 'getter'])
    assert.equal(tool(name).callable, false, name)
})

test('server annotations decide first: read-only runs, destructive never does', () => {
  assert.equal(tool('control_fan', { annotations: { readOnlyHint: true } }).callable, true)
  assert.equal(tool('get_and_delete', { annotations: { destructiveHint: true } }).callable, false)
})

test('paid tools are recognised from their description', () => {
  assert.equal(tool('scan_token', { description: 'PAID, 0.02 USDC per call via x402' }).paid, true)
  assert.equal(tool('get_cached_scores', { description: 'Return the last known scores' }).paid, false)
})

test('a form asks only for flat inputs; a required object makes the tool unusable here', () => {
  const t = tool('get_balance', { inputSchema: { type: 'object', required: ['address'], properties: { address: { type: 'string', description: 'Wallet' }, chain: { type: 'string', enum: ['base', 'celo'] }, limit: { type: 'integer' }, raw: { type: 'boolean' } } } })
  assert.deepEqual(t.fields.map((f) => [f.name, f.type, f.required]), [['address', 'string', true], ['chain', 'string', false], ['limit', 'integer', false], ['raw', 'boolean', false]])
  assert.deepEqual(t.fields[1].options, ['base', 'celo'])
  assert.equal(t.usable, true)
  assert.equal(tool('get_many', { inputSchema: { type: 'object', required: ['ids'], properties: { ids: { type: 'array' } } } }).usable, false)
})

test('tool names that are not plain identifiers are dropped', () => {
  assert.equal(cleanTool({ name: '<script>' }), null)
  assert.equal(cleanTool({ name: '' }), null)
})

test('messages go to a free chat or ask tool that takes text', () => {
  const text = { type: 'object', required: ['message'], properties: { message: { type: 'string' } } }
  assert.equal(chatTool([tool('get_time'), tool('chat', { inputSchema: text })])?.name, 'chat')
  assert.equal(chatTool([tool('ask_agent', { inputSchema: text })])?.name, 'ask_agent')
  assert.equal(chatTool([tool('chat', { inputSchema: text, description: 'PAID via x402' })]), null)
  assert.equal(chatTool([tool('chat')]), null)
  assert.equal(chatTool([tool('chatter_toggle', { inputSchema: text })]), null)
})

test('a JSON reply with one answer field reads as that answer', () => {
  assert.equal(chatReply('{"response":"I can check balances."}'), 'I can check balances.')
  assert.equal(chatReply('{"message":"Alpha scan running","sources":["dex"]}'), 'Alpha scan running')
  assert.equal(chatReply('plain words'), 'plain words')
  assert.equal(chatReply('{"score":60}'), '{"score":60}')
})
