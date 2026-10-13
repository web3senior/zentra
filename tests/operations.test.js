import https from 'node:https'
import dns from 'node:dns/promises'
import { EventEmitter } from 'node:events'
import { apiState, apiTarget, callApi, requestApi, executeApi, removeApi, saveApi } from '../src/lib/zentra/apiConnections'
import { test, before, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { ScriptedModel, assistantMessage, functionCall } from '@openai/agents/testing'
import { agentSchema } from '../src/lib/zentra/schema'
import { AppError, beginRun, createAgent, db, failRun, updateAgent } from '../src/lib/zentra/store'
import { agentFile, decideApproval, listFiles, ownerFile } from '../src/lib/zentra/workspace'
import { cancelJob, claimJob, eventKey, operations, pauseAgent, receiveEvent, recoverJobs, runMission, saveMission, settleJob, tickSchedules } from '../src/lib/zentra/queue'
import { allowedWebUrl, publicAddress, saveGithubKey } from '../src/lib/zentra/connectors'
import { workOnce } from '../src/lib/zentra/worker'
import { talk } from '../src/lib/zentra/runtime'
import { closeDatabase } from '../src/lib/zentra/database'
// A fresh encryption key for every run
process.env.ZENTRA_ENCRYPTION_KEY = randomBytes(32).toString('hex')
// Each test file gets its own throwaway MySQL database (ZENTRA_TEST_DATABASE_URL names the server)
const testDatabase = `zentra_test_operations_${randomUUID().replace(/-/g, '').slice(0, 10)}`
process.env.ZENTRA_DATABASE_URL = `${(process.env.ZENTRA_TEST_DATABASE_URL || 'mysql://root@127.0.0.1:3306').replace(/\/$/, '')}/${testDatabase}`
const owner = randomUUID(), other = randomUUID()
before(async () => {
  await db().prepare('INSERT INTO users VALUES (?, ?, ?)').run(owner, 'tester', 'unused')
  await db().prepare('INSERT INTO users VALUES (?, ?, ?)').run(other, 'other', 'unused')
})
const config = agentSchema.parse({ name: 'Mission agent', instructions: 'Research carefully.' })
const create = () => createAgent(owner, config)
const code = (name) => (e) => e instanceof AppError && e.code === name
test('file proposals require owner approval, cannot replay or cross tenants', async () => {
  const a = await create(), run = randomUUID()
  await beginRun(owner, a.id, run, 'write')
  const proposal = await agentFile(owner, a.id, run, { name: 'report.md', content: 'Reviewed bytes' })
  assert.equal((await listFiles(owner, a.id)).length, 0)
  await failRun(run)
  await assert.rejects(decideApproval(other, a.id, proposal.id, true), code('notFound'))
  await decideApproval(owner, a.id, proposal.id, true)
  assert.equal((await listFiles(owner, a.id))[0].content, 'Reviewed bytes')
  await assert.rejects(decideApproval(owner, a.id, proposal.id, true), code('approvalResolved'))
  await assert.rejects(ownerFile(owner, a.id, { name: '../escape.md', content: '' }))
})
test('approval detects edited files and pause revokes pending proposals', async () => {
  const a = await create(), run = randomUUID()
  await beginRun(owner, a.id, run, 'write')
  const p = await agentFile(owner, a.id, run, { name: 'note.txt', content: 'agent' })
  await failRun(run)
  await ownerFile(owner, a.id, { name: 'note.txt', content: 'owner' })
  await assert.rejects(decideApproval(owner, a.id, p.id, true), code('fileConflict'))
  await pauseAgent(owner, a.id, true)
  assert.equal((await operations(owner, a.id)).approvals[0].status, 'rejected')
})
test('SDK file tool creates a proposal instead of silently writing', async () => {
  const a = await create()
  const model = new ScriptedModel([[functionCall('save_file', { name: 'result.md', content: 'Summary' }, { callId: 'file-1' })], [assistantMessage('Please review my proposed file.')]])
  await talk(owner, a.id, randomUUID(), 'Create a summary', new AbortController().signal, model)
  model.assertComplete()
  assert.equal((await operations(owner, a.id)).approvals.length, 1)
  assert.equal((await listFiles(owner, a.id)).length, 0)
})
test('events authenticate, deduplicate, revoke and enforce owner isolation', async () => {
  const a = await create()
  await saveMission(owner, a.id, { prompt: 'Read event', eventsEnabled: true })
  const token = await eventKey(owner, a.id)
  await assert.rejects(receiveEvent(a.id, 'wrong', 'one', 'data'), code('eventAuth'))
  const id = await receiveEvent(a.id, token, 'one', 'data')
  assert.equal(await receiveEvent(a.id, token, 'one', 'data'), id)
  await assert.rejects(operations(other, a.id), code('notFound'))
  await eventKey(owner, a.id, true)
  await assert.rejects(receiveEvent(a.id, token, 'two', ''), code('eventAuth'))
  await cancelJob(owner, a.id, id)
})
test('schedules skip missed intervals and only queue one outstanding run', async () => {
  const a = await create()
  await saveMission(owner, a.id, { prompt: 'Research', enabled: true, intervalMinutes: 15 })
  const due = (await operations(owner, a.id)).next
  await tickSchedules(due)
  await tickSchedules(due + 900000)
  assert.equal((await operations(owner, a.id)).jobs.length, 1)
  await pauseAgent(owner, a.id, true)
  assert.equal((await operations(owner, a.id)).jobs[0].status, 'cancelled')
})
test('worker runs SDK mission and stores durable result with browser absent', async () => {
  const a = await create()
  await saveMission(owner, a.id, { prompt: 'Summarize' })
  await runMission(owner, a.id, randomUUID())
  const model = new ScriptedModel([[assistantMessage('Background result')]])
  await workOnce(new AbortController().signal, (o, id, r, p, signal, _model, job) => talk(o, id, r, p, signal, model, job))
  assert.equal((await operations(owner, a.id)).jobs[0].result, 'Background result')
  assert.equal((await operations(owner, a.id)).jobs[0].status, 'complete')
})
test('claims exclude duplicate execution; expired leases do not replay unknown work', async () => {
  const a = await create()
  await saveMission(owner, a.id, { prompt: 'Run' })
  await runMission(owner, a.id, randomUUID())
  const job = await claimJob()
  assert.equal(job.agent, a.id)
  assert.equal(await claimJob(), null)
  await recoverJobs(Date.now() + 160000)
  assert.equal((await operations(owner, a.id)).jobs[0].status, 'interrupted')
})
test('retries are suppressed after file side effects', async () => {
  const a = await create()
  await updateAgent(owner, a.id, { ...config, fileWriteMode: 'allow' })
  await saveMission(owner, a.id, { prompt: 'Run', maxRetries: 3 })
  await runMission(owner, a.id, randomUUID())
  const job = await claimJob()
  await settleJob(job, null, 'providerError')
  assert.equal((await operations(owner, a.id)).jobs[0].status, 'queued')
  const retry = await claimJob(Date.now() + 65000)
  await beginRun(owner, a.id, retry.run, 'write', retry.id)
  await agentFile(owner, a.id, retry.run, { name: 'saved.txt', content: 'Once' })
  await failRun(retry.run)
  await settleJob(retry, null, 'providerError')
  assert.equal((await operations(owner, a.id)).jobs[0].status, 'failed')
})
test('retry count is bounded and cancelled claims cannot start inference', async () => {
  const a = await create()
  await saveMission(owner, a.id, { prompt: 'Run', maxRetries: 0 })
  await runMission(owner, a.id, randomUUID())
  const job = await claimJob()
  await settleJob(job, null, 'providerError')
  assert.equal((await operations(owner, a.id)).jobs[0].status, 'failed')
  await runMission(owner, a.id, randomUUID())
  const cancelled = await claimJob()
  await cancelJob(owner, a.id, cancelled.id)
  await assert.rejects(beginRun(owner, a.id, cancelled.run, 'late run', cancelled.id), code('stopped'))
})
test('web access rejects private addresses, credentials and unapproved hosts', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', '224.0.0.1'])
    assert.equal(publicAddress(ip), false)
  assert.equal(publicAddress('8.8.8.8'), true)
  for (const url of ['http://example.com', 'https://user:secret@example.com', 'https://evil.com', 'https://example.com:8080', 'https://127.0.0.1'])
    assert.throws(() => allowedWebUrl(url, ['example.com']), code('permission'))
  assert.equal(allowedWebUrl('https://example.com/docs', ['example.com']).pathname, '/docs')
})
test('integration secrets are encrypted and scoped to the owner', async () => {
  const a = await create()
  await saveGithubKey(owner, a.id, 'test-secret-not-real')
  const row = await db().prepare('SELECT encrypted FROM connections WHERE agent = ?').get(a.id)
  assert.ok(!row.encrypted.includes('test-secret'))
  await assert.rejects(saveGithubKey(other, a.id, null), code('notFound'))
  assert.ok(!JSON.stringify(await operations(owner, a.id)).includes('test-secret'))
  await saveGithubKey(owner, a.id, null)
})
test('API mutations require exact one-time approval and credentials stay private', async () => {
  const a = await create(), run = randomUUID()
  const id = await saveApi(owner, a.id, { name: 'Tasks', url: 'https://api.example.com/tasks', method: 'POST', instructions: 'Create with title JSON field.', auth: 'bearer', secret: 'private-test-token', autoRead: true })
  assert.ok(!JSON.stringify(await apiState(owner, a.id)).includes('private-test-token'))
  await beginRun(owner, a.id, run, 'Create a task')
  const proposal = await callApi(owner, a.id, run, id, '', '{"title":"Review"}', new AbortController().signal)
  assert.equal(proposal.status, 'awaiting_owner_approval')
  await failRun(run)
  const pending = (await apiState(owner, a.id)).requests[0]
  let sends = 0
  const send = async (url, method, body, auth, secret) => {
    sends++
    assert.equal(url.href, 'https://api.example.com/tasks')
    assert.equal(method, 'POST')
    assert.equal(body, '{"title":"Review"}')
    assert.equal(auth, 'bearer')
    assert.equal(secret, 'private-test-token')
    return '{"ok":true}'
  }
  await assert.rejects(executeApi(other, a.id, pending.id, new AbortController().signal, undefined, send), code('notFound'))
  await executeApi(owner, a.id, pending.id, new AbortController().signal, undefined, send)
  await assert.rejects(executeApi(owner, a.id, pending.id, new AbortController().signal, undefined, send), code('approvalResolved'))
  assert.equal(sends, 1)
  assert.equal((await apiState(owner, a.id)).requests[0].result, '{"ok":true}')
})
test('API URL cannot escape the endpoint and removed connections revoke approval', async () => {
  assert.equal(apiTarget('https://api.example.com/tasks', 'next=https://evil.example').origin, 'https://api.example.com')
  const a = await create(), run = randomUUID()
  const config = { name: 'API', url: 'https://api.example.com/tasks', method: 'DELETE', instructions: 'Remove task', auth: 'none' }
  await assert.rejects(saveApi(owner, a.id, { ...config, url: 'https://api.example.com/tasks?key=secret' }))
  await assert.rejects(saveApi(owner, a.id, { ...config, url: 'http://api.example.com/tasks' }))
  const id = await saveApi(owner, a.id, config)
  await beginRun(owner, a.id, run, 'Delete')
  await callApi(owner, a.id, run, id, 'id=1', '', new AbortController().signal)
  await failRun(run)
  const pending = (await apiState(owner, a.id)).requests[0]
  await removeApi(owner, a.id, id)
  assert.equal((await apiState(owner, a.id)).requests[0].status, 'rejected')
  await assert.rejects(executeApi(owner, a.id, pending.id, new AbortController().signal), code('permission'))
})
test('uncertain API outcomes are never replayed', async () => {
  const a = await create(), run = randomUUID()
  const id = await saveApi(owner, a.id, { name: 'API', url: 'https://api.example.com/tasks', method: 'POST', instructions: 'Create task', auth: 'none' })
  await beginRun(owner, a.id, run, 'Create')
  await callApi(owner, a.id, run, id, '', '{}', new AbortController().signal)
  await failRun(run)
  const pending = (await apiState(owner, a.id)).requests[0]
  await assert.rejects(executeApi(owner, a.id, pending.id, new AbortController().signal, undefined, async () => { throw Error('timeout with secret'); }), code('apiFailed'))
  assert.equal((await apiState(owner, a.id)).requests[0].status, 'uncertain')
  await assert.rejects(executeApi(owner, a.id, pending.id, new AbortController().signal), code('approvalResolved'))
})
test('API transport pins public DNS, injects credentials and redacts echoed secrets', async () => {
  const a = await create(), run = randomUUID()
  const id = await saveApi(owner, a.id, { name: 'Read API', url: 'https://api.example.com/tasks', method: 'GET', instructions: 'Read tasks', auth: 'x-api-key', secret: 'private-test-token', autoRead: true })
  await beginRun(owner, a.id, run, 'Read')
  const lookup = mock.method(dns, 'resolve4', async () => ['8.8.8.8'])
  let sent = 0
  const network = mock.method(https, 'request', (_url, options, receive) => {
    sent++
    assert.equal(options.headers['X-API-Key'], 'private-test-token')
    options.lookup('api.example.com', {}, (_error, address) => assert.equal(address, '8.8.8.8'))
    const req = new EventEmitter()
    req.end = () => queueMicrotask(() => { const response = Object.assign(new EventEmitter(), { statusCode: 200 }); receive(response); response.emit('data', Buffer.from('private-test-token response')); response.emit('end'); })
    return req
  })
  try {
    const result = await callApi(owner, a.id, run, id, '', '', new AbortController().signal)
    assert.equal(result.status, 'complete')
    assert.equal(sent, 1)
    assert.equal((await apiState(owner, a.id)).requests[0].result, '[redacted] response')
  }
  finally {
    lookup.mock.restore()
    network.mock.restore()
    await failRun(run)
  }
})
test('agent proposes an API action through the SDK without a configured connection', async () => {
  const a = await create()
  const model = new ScriptedModel([[functionCall('request_api', { url: 'https://api.example.com/tasks', method: 'POST', body: '{"title":"New task"}', reason: 'Create your requested task', auth: 'bearer' }, { callId: 'direct-api' })], [assistantMessage('Please approve this request in the conversation.')]])
  await talk(owner, a.id, randomUUID(), 'Create a task using this API', new AbortController().signal, model)
  model.assertComplete()
  const state = await apiState(owner, a.id)
  assert.equal(state.connections.length, 0)
  assert.equal(state.requests[0].status, 'pending')
  await assert.rejects(executeApi(owner, a.id, state.requests[0].id, new AbortController().signal), code('apiCredential'))
  let calls = 0
  await executeApi(owner, a.id, state.requests[0].id, new AbortController().signal, undefined, async (_url, _method, _body, auth, secret) => { calls++; assert.equal(auth, 'bearer'); assert.equal(secret, 'one-time-secret'); return 'Created'; }, 'one-time-secret')
  assert.equal(calls, 1)
  assert.ok(!JSON.stringify(await apiState(owner, a.id)).includes('one-time-secret'))
})
test('direct public API reads need no setup and unsafe URLs remain rejected', async () => {
  const a = await create(), run = randomUUID()
  await beginRun(owner, a.id, run, 'Read public data')
  const dnsMock = mock.method(dns, 'resolve4', async () => ['127.0.0.1'])
  try {
    await assert.rejects(requestApi(owner, a.id, run, { url: 'https://public.example/data', method: 'GET', body: '', reason: 'Read data', auth: 'none' }, new AbortController().signal), code('apiFailed'))
    assert.equal((await apiState(owner, a.id)).requests[0].status, 'uncertain')
    await assert.rejects(requestApi(owner, a.id, run, { url: 'http://localhost/admin', method: 'POST', body: '{}', reason: 'Unsafe', auth: 'none' }, new AbortController().signal), code('permission'))
  }
  finally {
    dnsMock.mock.restore()
    await failRun(run)
  }
})
after(async () => { await db().prepare(`DROP DATABASE ${testDatabase}`).run(); await closeDatabase(); })
