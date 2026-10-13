import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { ScriptedModel, assistantMessage, functionCall, modelError, modelResponder } from '@openai/agents/testing'
import { authenticate, assertOrigin, ownerFromRequest, logout, requestEmailCode, setPublicName, userInfo, verifyEmailCode } from '../src/lib/zentra/auth'
import { walletNonce, walletSignIn } from '../src/lib/zentra/wallets'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createSiweMessage } from 'viem/siwe'
import { agentSchema } from '../src/lib/zentra/schema'
import { AppError, beginRun, createAgent, db, failRun, getAgent, listAgents, messages, removeAgent, setMemory, updateAgent } from '../src/lib/zentra/store'
import { stopRun, talk } from '../src/lib/zentra/runtime'
import { providerStatus, readAimlKey, removeAimlKey, saveAimlKey } from '../src/lib/zentra/providerKeys'
import { agentProviders } from '../src/config/agentProviders'
import { closeDatabase } from '../src/lib/zentra/database'
// A fresh encryption key for every run
process.env.ZENTRA_ENCRYPTION_KEY = randomBytes(32).toString('hex')
// Each test file gets its own throwaway MySQL database (ZENTRA_TEST_DATABASE_URL names the server)
const testDatabase = `zentra_test_agents_${randomUUID().replace(/-/g, '').slice(0, 10)}`
process.env.ZENTRA_DATABASE_URL = `${(process.env.ZENTRA_TEST_DATABASE_URL || 'mysql://root@127.0.0.1:3306').replace(/\/$/, '')}/${testDatabase}`
const config = agentSchema.parse({ name: 'Miso', instructions: 'Help with research.' })
let owner, other
const request = (token) => new Request('https://localhost:3000/api/zentra/session', { headers: { cookie: `zentra_session=${token}` } })
const isCode = (code) => (error) => error instanceof AppError && error.code === code
test('accounts verify passwords, hash sessions, support logout, and separate tenants', async () => {
  const token = await authenticate({ username: 'alice', password: 'a-test-password-long' }, true)
  owner = await ownerFromRequest(request(token))
  other = await ownerFromRequest(request(await authenticate({ username: 'bob', password: 'another-long-password' }, true)))
  assert.notEqual(owner, other)
  await assert.rejects(ownerFromRequest(request('forged')), isCode('signIn'))
  await assert.rejects(authenticate({ username: 'alice', password: 'wrong-password-long' }, false), isCode('credentials'))
  const login = await authenticate({ username: 'alice', password: 'a-test-password-long' }, false)
  assert.equal(await ownerFromRequest(request(login)), owner)
  assert.equal(await db().prepare('SELECT token FROM sessions WHERE token = ?').get(token), undefined)
  await logout(request(login))
  await assert.rejects(ownerFromRequest(request(login)), isCode('signIn'))
})
// Without SMTP settings the code is logged; the test reads it from there
async function emailCode(email) {
  const original = console.log
  let code
  console.log = (line) => { code = String(line).match(/: (\d{6})$/)?.[1] }
  try {
    await requestEmailCode({ email })
  }
  finally {
    console.log = original
  }
  return code
}
test('email sign-in creates the account once, signs it in again, and never takes a password', async () => {
  const code = await emailCode('  Carol.Smith@Example.org ')
  assert.match(code, /^\d{6}$/)
  assert.equal((await db().prepare('SELECT hash FROM email_codes WHERE email = ?').get('carol.smith@example.org')).hash.includes(code), false)
  const carol = await ownerFromRequest(request(await verifyEmailCode({ email: 'carol.smith@example.org', code })))
  assert.equal((await db().prepare('SELECT username FROM users WHERE id = ?').get(carol)).username, 'carol-smith')
  await assert.rejects(verifyEmailCode({ email: 'carol.smith@example.org', code }), isCode('codeExpired'), 'a code works once')
  const again = await verifyEmailCode({ email: 'carol.smith@example.org', code: await emailCode('carol.smith@example.org') })
  assert.equal(await ownerFromRequest(request(again)), carol)
  await assert.rejects(authenticate({ username: 'carol-smith', password: 'any-long-password' }, false), isCode('credentials'))
})
test('email codes allow five tries, and a new address can follow with an invite', async () => {
  const code = await emailCode('dave@example.org')
  const wrong = code === '000000' ? '111111' : '000000'
  for (let i = 0; i < 4; i++)
    await assert.rejects(verifyEmailCode({ email: 'dave@example.org', code: wrong }), isCode('codeWrong'))
  process.env.ZENTRA_SIGNUP_TOKEN = 'colony-invite'
  try {
    await assert.rejects(verifyEmailCode({ email: 'dave@example.org', code }), isCode('invite'))
    await assert.rejects(verifyEmailCode({ email: 'dave@example.org', code, invite: 'colony-invite' }), isCode('codeExpired'), 'the fifth try was spent')
    const fresh = await emailCode('dave@example.org')
    await assert.rejects(verifyEmailCode({ email: 'dave@example.org', code: fresh }), isCode('invite'))
    assert.ok(await ownerFromRequest(request(await verifyEmailCode({ email: 'dave@example.org', code: fresh, invite: 'colony-invite' }))))
  }
  finally {
    delete process.env.ZENTRA_SIGNUP_TOKEN
  }
})
// A wallet signs the sign-in message as a browser would
async function signedIn(account, { domain = 'localhost:3000', reuse } = {}) {
  const { nonce, statement } = reuse ?? await walletNonce({ address: account.address })
  const message = createSiweMessage({ domain, address: account.address, statement, uri: `https://${domain}`, version: '1', chainId: 1, nonce, issuedAt: new Date(), expirationTime: new Date(Date.now() + 600_000) })
  return { nonce, statement, input: { message, signature: await account.signMessage({ message }) } }
}
const site = new Request('https://localhost:3000/api/zentra/auth/wallet/verify')
test('wallet sign-in: one account per wallet, single-use nonces, this site only, public name next', async () => {
  const wallet = privateKeyToAccount(generatePrivateKey())
  const first = await signedIn(wallet)
  const owner = await ownerFromRequest(request(await walletSignIn(site, first.input)))
  assert.deepEqual(await userInfo(owner), { username: `wallet-${wallet.address.slice(2, 8).toLowerCase()}`, named: false, up: false, profile: null })
  await assert.rejects(walletSignIn(site, first.input), isCode('walletNonce'), 'a nonce works once')
  assert.equal(await ownerFromRequest(request(await walletSignIn(site, (await signedIn(wallet)).input))), owner)
  await assert.rejects(walletSignIn(site, (await signedIn(wallet, { domain: 'evil.example' })).input), isCode('walletSignature'))
  // Signed by another wallet over this wallet's message and nonce
  const forged = await signedIn(wallet)
  const intruder = privateKeyToAccount(generatePrivateKey())
  await assert.rejects(walletSignIn(site, { ...forged.input, signature: await intruder.signMessage({ message: forged.input.message }) }), isCode('walletSignature'))
  assert.deepEqual(await setPublicName(owner, { name: 'Moon-Walker' }), { username: 'moon-walker', named: true, up: false, profile: null })
  await assert.rejects(setPublicName(other, { name: 'moon-walker' }), isCode('usernameTaken'))
})
test('same-origin protection rejects forged mutation origins', async () => {
  assert.throws(() => assertOrigin(new Request('https://localhost:3000/api', { headers: { origin: 'https://evil.example' } })), isCode('origin'))
  assertOrigin(new Request('https://localhost:3000/api', { headers: { origin: 'https://localhost:3000' } }))
})
test('config and notes cannot be read, edited or removed by another account', async () => {
  const agent = await createAgent(owner, config)
  await setMemory(owner, agent.id, 'Private research notes')
  await updateAgent(owner, agent.id, { ...config, name: 'Nova' })
  assert.equal((await getAgent(owner, agent.id)).agent.name, 'Nova')
  assert.equal((await getAgent(owner, agent.id)).memory, 'Private research notes')
  assert.equal((await listAgents(other)).length, 0)
  for (const action of [() => getAgent(other, agent.id), () => messages(other, agent.id), () => setMemory(other, agent.id, 'overwrite'), () => removeAgent(other, agent.id)])
    await assert.rejects(action, isCode('notFound'))
})
test('reservations enforce concurrency, daily cap, pause and duplicate IDs', async () => {
  const agent = await createAgent(owner, { ...config, dailyRuns: 1 })
  const run = randomUUID()
  await beginRun(owner, agent.id, run, 'hello')
  await assert.rejects(beginRun(owner, agent.id, randomUUID(), 'again'), isCode('busy'))
  await assert.rejects(updateAgent(owner, agent.id, config), isCode('busy'))
  await failRun(run)
  await assert.rejects(beginRun(owner, agent.id, run, 'replay'), isCode('duplicate'))
  await assert.rejects(beginRun(owner, agent.id, randomUUID(), 'again'), isCode('quota'))
  const paused = await createAgent(owner, { ...config, paused: true })
  await assert.rejects(beginRun(owner, paused.id, randomUUID(), 'hello'), isCode('paused'))
  assert.equal((await messages(owner, agent.id)).length, 1)
})
test('real SDK loop executes memory tool and persists reply and conversation history', async () => {
  const agent = await createAgent(owner, config)
  const model = new ScriptedModel([
    [functionCall('save_memory', { notes: 'User prefers concise answers.' }, { callId: 'call-1' })],
    [assistantMessage('I will remember that.')],
  ])
  const result = await talk(owner, agent.id, randomUUID(), 'Remember that I prefer concise answers.', new AbortController().signal, model)
  assert.equal(result.memory, 'User prefers concise answers.')
  assert.equal(result.messages.at(-1)?.content, 'I will remember that.')
  assert.equal(result.agent.runsToday, 1)
  model.assertComplete()
  const second = new ScriptedModel([[assistantMessage('Hello again.')]])
  await talk(owner, agent.id, randomUUID(), 'Hello', new AbortController().signal, second)
  assert.match(JSON.stringify(second.firstCall?.request.input), /I will remember that/)
  assert.equal(second.firstCall?.request.modelSettings.maxTokens, 1024)
  assert.equal(second.firstCall?.request.modelSettings.store, false)
})
test('disabled memory is not exposed to the model', async () => {
  const agent = await createAgent(owner, { ...config, memoryEnabled: false, filesEnabled: false })
  await setMemory(owner, agent.id, 'Secret workspace note')
  const model = new ScriptedModel([[assistantMessage('Hello')]])
  await talk(owner, agent.id, randomUUID(), 'Hello', new AbortController().signal, model)
  assert.doesNotMatch(JSON.stringify(model.firstCall?.request.tools), /read_memory|save_memory/)
  assert.doesNotMatch(JSON.stringify(model.firstCall?.request.input), /Secret workspace note/)
})
test('memory reader returns only the current agent notes', async () => {
  const agent = await createAgent(owner, config)
  const otherAgent = await createAgent(owner, config)
  await setMemory(owner, agent.id, 'Current workspace fact')
  await setMemory(owner, otherAgent.id, 'Other workspace secret')
  const model = new ScriptedModel([
    [functionCall('read_memory', {}, { callId: 'read-1' })],
    [assistantMessage('I found your notes.')],
  ])
  await talk(owner, agent.id, randomUUID(), 'What do you remember?', new AbortController().signal, model)
  assert.match(JSON.stringify(model.lastCall?.request.input), /Current workspace fact/)
  assert.doesNotMatch(JSON.stringify(model.lastCall?.request.input), /Other workspace secret/)
})
test('model-turn cap prevents an unlimited tool loop', async () => {
  const agent = await createAgent(owner, { ...config, maxTurns: 1 })
  const model = new ScriptedModel([[functionCall('read_memory', {}, { callId: 'loop-1' })]])
  await assert.rejects(talk(owner, agent.id, randomUUID(), 'Research forever', new AbortController().signal, model), isCode('turnLimit'))
  assert.equal(model.calls.length, 1)
  await assert.doesNotReject(updateAgent(owner, agent.id, config))
})
test('explicit stop aborts execution and prevents late assistant commits', async () => {
  const agent = await createAgent(owner, config)
  const model = new ScriptedModel([modelResponder(async () => {
      await stopRun(owner, agent.id)
      return [assistantMessage('Late reply')]
    })])
  await assert.rejects(talk(owner, agent.id, randomUUID(), 'Hello', new AbortController().signal, model), isCode('cancelled'))
  assert.equal((await messages(owner, agent.id)).length, 1)
  assert.equal((await getAgent(owner, agent.id)).agent.runsToday, 1)
})
test('provider failures are redacted and release the active reservation', async () => {
  const agent = await createAgent(owner, config)
  const model = new ScriptedModel([modelError(new Error('sensitive-secret-value'))])
  await assert.rejects(talk(owner, agent.id, randomUUID(), 'Hello', new AbortController().signal, model), isCode('providerError'))
  await assert.doesNotReject(updateAgent(owner, agent.id, config))
})
test('missing key fails before reserving a run or saving a message', async () => {
  const key = process.env.OPENAI_API_KEY
  delete process.env.OPENAI_API_KEY
  const agent = await createAgent(owner, config)
  await assert.rejects(talk(owner, agent.id, randomUUID(), 'Hello', new AbortController().signal), isCode('missingKey'))
  assert.equal((await getAgent(owner, agent.id)).agent.runsToday, 0)
  assert.equal((await messages(owner, agent.id)).length, 0)
  if (key)
    process.env.OPENAI_API_KEY = key
})
test('AIML keys are encrypted, owner-bound, write-only to clients, replaceable and removable', async () => {
  const key = 'test-aiml-private-key-12345'
  await saveAimlKey(owner, key)
  assert.equal(await readAimlKey(owner), key)
  assert.equal(await readAimlKey(other), undefined)
  const row = await db().prepare('SELECT encrypted FROM provider_keys WHERE owner = ?').get(owner)
  assert.equal(row.encrypted.includes(key), false)
  assert.equal(JSON.stringify(await providerStatus(owner)).includes(key), false)
  assert.equal((await providerStatus(other)).aimlapi.ready, false)
  await db().prepare('INSERT INTO provider_keys VALUES (?, ?)').run(other, row.encrypted)
  await assert.rejects(readAimlKey(other), isCode('encryptionSetup'))
  await removeAimlKey(other)
  await saveAimlKey(owner, 'test-replacement-key-67890')
  assert.equal(await readAimlKey(owner), 'test-replacement-key-67890')
  await removeAimlKey(owner)
  assert.equal(await readAimlKey(owner), undefined)
  assert.equal((await providerStatus(owner)).aimlapi.ready, false)
})
test('existing agent records default to OpenAI and AIML model IDs validate', async () => {
  assert.equal(agentSchema.parse({ name: 'Legacy', instructions: 'Help' }).provider, 'openai')
  assert.equal(agentSchema.parse({ ...config, provider: 'aimlapi', model: agentProviders.aimlapi.defaultModel }).provider, 'aimlapi')
  assert.throws(() => agentSchema.parse({ ...config, provider: 'openai', model: 'foreign-model' }))
  assert.throws(() => agentSchema.parse({ ...config, provider: 'aimlapi', model: 'https://evil.example?secret' }))
})
test('AIML transport uses its own key, Chat Completions endpoint, model and memory tool round-trip', async () => {
  const key = 'fake-transport-test-key-123'
  await saveAimlKey(owner, key)
  const agent = await createAgent(owner, { ...config, provider: 'aimlapi', model: agentProviders.aimlapi.defaultModel })
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    assert.equal(request.url, 'https://api.aimlapi.com/v1/chat/completions')
    assert.equal(request.headers.get('authorization'), `Bearer ${key}`)
    const body = await request.json()
    assert.equal(body.model, agentProviders.aimlapi.defaultModel)
    assert.equal(body.max_tokens, 1024)
    assert.equal(body.reasoning_effort, 'low')
    assert.equal('store' in body, false)
    const apiTool = body.tools.find((item) => item.function.name === 'request_api')
    assert.ok(apiTool)
    assert.equal(apiTool.function.parameters.properties.url.format, undefined, 'Provider tool schema must not contain unsupported uri format')
    assert.ok(body.tools.some((item) => item.function.name === 'save_memory'))
    calls++
    if (calls > 1)
      assert.ok(body.messages.some((item) => item.role === 'tool' && item.content.includes('Notes saved')))
    return Response.json({
      id: `chatcmpl-test-${calls}`, object: 'chat.completion', created: 1, model: body.model,
      choices: [{ index: 0, finish_reason: calls === 1 ? 'tool_calls' : 'stop', message: calls === 1 ? {
            role: 'assistant', content: null, tool_calls: [{ id: 'aiml-save', type: 'function', function: { name: 'save_memory', arguments: JSON.stringify({ notes: 'Stored through AIML transport.' }) } }],
          } : { role: 'assistant', content: 'Saved your note.' } }],
      usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
    })
  }
  try {
    const result = await talk(owner, agent.id, randomUUID(), 'Remember this note', new AbortController().signal)
    assert.equal(calls, 2)
    assert.equal(result.memory, 'Stored through AIML transport.')
    assert.equal(result.messages.at(-1)?.content, 'Saved your note.')
    assert.equal(result.agent.runsToday, 1)
  }
  finally {
    globalThis.fetch = originalFetch
    await removeAimlKey(owner)
  }
})
after(async () => { await db().prepare(`DROP DATABASE ${testDatabase}`).run(); await closeDatabase(); })
