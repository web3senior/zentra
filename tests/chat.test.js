import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { AppError, db } from '../src/lib/zentra/store'
import { startSession } from '../src/lib/zentra/auth'
import { closeDatabase } from '../src/lib/zentra/database'
import { deleteMessage, directConversations, dmRoom, editMessage, history, mute, postMessage, react, roomAccess, setBlock } from '../src/lib/zentra/chat'
process.env.ZENTRA_ENCRYPTION_KEY = randomBytes(32).toString('hex')
const testDatabase = `zentra_test_chat_${randomUUID().replace(/-/g, '').slice(0, 10)}`
process.env.ZENTRA_DATABASE_URL = `${(process.env.ZENTRA_TEST_DATABASE_URL || 'mysql://root@127.0.0.1:3306').replace(/\/$/, '')}/${testDatabase}`
process.env.ZENTRA_MODERATORS = 'mod'
const isCode = (code) => (error) => error instanceof AppError && error.code === code
// A person with a public name (named) or a new account still choosing one
async function person(name, named = true) {
  const id = randomUUID()
  await db().prepare('INSERT INTO users VALUES (?, ?, ?)').run(id, name, '')
  await db().prepare('INSERT INTO profiles VALUES (?, ?)').run(id, named ? 1 : 0)
  return id
}
let ann, ben, cat, mod, newbie
test('rooms: areas for everyone, a 1:1 room only for its pair', async () => {
  ann = await person('ann'); ben = await person('ben'); cat = await person('cat'); mod = await person('mod'); newbie = await person('wallet-abc', false)
  assert.equal(roomAccess(ann, 'area:hub').kind, 'area')
  assert.throws(() => roomAccess(ann, 'area:nowhere'), isCode('notFound'))
  const room = dmRoom(ben, ann)
  assert.equal(room, dmRoom(ann, ben), 'the same room from either side')
  assert.equal(roomAccess(ann, room).other, ben)
  assert.throws(() => roomAccess(cat, room), isCode('notFound'))
  await assert.rejects(history(cat, room), isCode('notFound'))
})
test('area chat: plain lines, replies, reactions, edits and deletes', async () => {
  const { line } = await postMessage(ann, { room: 'area:hub', body: '  hello <b>colony</b>  ' })
  assert.equal(line.body, 'hello <b>colony</b>', 'kept as text, trimmed')
  const reply = (await postMessage(ben, { room: 'area:hub', body: 'hi ann', replyTo: line.id })).line
  assert.equal(reply.replyTo, line.id)
  assert.deepEqual((await react(ben, { id: line.id, emoji: '🔥' })).reactions, { '🔥': [ben] })
  assert.deepEqual((await react(ben, { id: line.id, emoji: '🔥' })).reactions, {}, 'a second tap removes it')
  await assert.rejects(react(ben, { id: line.id, emoji: '💩' }))
  await assert.rejects(editMessage(ben, { id: line.id, body: 'mine now' }), isCode('chatNotYours'))
  assert.equal((await editMessage(ann, { id: line.id, body: 'hello colony' })).body, 'hello colony')
  await assert.rejects(deleteMessage(cat, { id: reply.id }), isCode('chatNotYours'))
  const removed = await deleteMessage(mod, { id: reply.id })
  assert.equal(removed.deleted, true)
  assert.equal(removed.body, '')
  await assert.rejects(postMessage(newbie, { room: 'area:hub', body: 'hi' }), isCode('chatName'), 'a public name comes first')
  const { lines } = await history(cat, 'area:hub')
  assert.deepEqual(lines.map((l) => l.body), ['hello colony', ''])
})
test('1:1: unread counts, blocks hide and stop messages, moderators mute', async () => {
  const room = dmRoom(ann, cat)
  await postMessage(ann, { room, body: 'hey cat' })
  await postMessage(ann, { room, body: 'are you around?' })
  const [conversation] = await directConversations(cat)
  assert.equal(conversation.with.name, 'ann')
  assert.equal(conversation.unread, 2)
  assert.equal((await directConversations(ann))[0].unread, 0, 'your own lines are read')
  await setBlock(cat, { user: ann, blocked: true })
  await assert.rejects(postMessage(ann, { room, body: 'hello?' }), isCode('chatBlocked'))
  await assert.rejects(postMessage(cat, { room, body: 'bye' }), isCode('chatBlocked'), 'blocking works both ways for 1:1')
  assert.equal((await directConversations(cat)).length, 0)
  assert.equal((await history(cat, 'area:hub')).lines.length, 1, "ann's area lines are hidden from cat")
  await setBlock(cat, { user: ann, blocked: false })
  await assert.rejects(mute(ann, { user: ben }), isCode('chatNotYours'))
  await mute(mod, { user: ben })
  await assert.rejects(postMessage(ben, { room: 'area:hub', body: 'still here' }), isCode('chatMuted'))
})
test('limits: 20 messages a minute per person', async () => {
  const fast = await person('fast')
  for (let i = 0; i < 20; i++)
    await postMessage(fast, { room: 'area:jobs', body: `line ${i}` })
  await assert.rejects(postMessage(fast, { room: 'area:jobs', body: 'one more' }), isCode('chatRate'))
})
// The realtime process with two people: positions, a live line, and a visitor who only watches
test('realtime: people see each other walk and chat live; visitors only watch', { timeout: 60000 }, async () => {
  const port = 3500 + Math.floor(Math.random() * 400)
  const server = spawn(process.execPath, ['--import', 'tsx', 'server/realtime.js'], { env: { ...process.env, ZENTRA_REALTIME_PORT: String(port), ZENTRA_APP_ORIGIN: 'https://zentra.test', NODE_ENV: 'production', TSX_TSCONFIG_PATH: 'jsconfig.json' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  server.stdout.on('data', (d) => { output += d })
  server.stderr.on('data', (d) => { output += d })
  try {
    for (let i = 0; i < 100 && !output.includes('listening'); i++)
      await new Promise((resolve) => setTimeout(resolve, 200))
    assert.ok(output.includes('listening'), output)
    const open = async (owner) => {
      const headers = { origin: 'https://zentra.test', ...(owner ? { cookie: `zentra_session=${await startSession(owner)}` } : {}) }
      const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers })
      const inbox = []
      socket.on('message', (data) => inbox.push(JSON.parse(String(data))))
      await new Promise((resolve, reject) => { socket.on('open', resolve); socket.on('error', reject) })
      const next = async (type, match = () => true) => {
        for (let i = 0; i < 100; i++) {
          const found = inbox.findIndex((m) => m.t === type && match(m))
          if (found >= 0)
            return inbox.splice(found, 1)[0]
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
        throw new Error(`no ${type}: ${JSON.stringify(inbox)}`)
      }
      return { socket, send: (m) => socket.send(JSON.stringify(m)), next }
    }
    const a = await open(ann), c = await open(cat), visitor = await open(null)
    assert.equal((await a.next('welcome')).you.name, 'ann')
    assert.equal((await visitor.next('welcome')).you, null)
    a.send({ t: 'move', x: 3, y: 0, z: -4, f: 1.2, m: true })
    const seen = await c.next('people', (m) => m.list.some((p) => p.id === ann))
    assert.deepEqual(seen.list.find((p) => p.id === ann), { id: ann, name: 'ann', up: false, x: 3, y: 0, z: -4, f: 1.2, m: true })
    await visitor.next('people', (m) => m.list.some((p) => p.id === ann))
    visitor.send({ t: 'move', x: 1, y: 0, z: 1, f: 0, m: false })
    visitor.send({ t: 'say', room: 'area:hub', body: 'sneaky', ref: 1 })
    assert.equal((await visitor.next('error')).code, 'signIn')
    a.send({ t: 'join', room: 'area:lukso' })
    c.send({ t: 'join', room: 'area:lukso' })
    await new Promise((resolve) => setTimeout(resolve, 200))
    c.send({ t: 'say', room: 'area:lukso', body: 'live from LUKSO', ref: 7 })
    assert.equal((await a.next('line')).line.body, 'live from LUKSO')
    assert.ok((await c.next('sent')).id > 0)
    a.send({ t: 'join', room: dmRoom(ann, ben) })
    a.send({ t: 'join', room: dmRoom(cat, ben) })
    assert.equal((await a.next('error')).code, 'notFound', "someone else's 1:1 room")
    a.socket.close()
    await c.next('gone', (m) => m.id === ann)
    c.socket.close()
    visitor.socket.close()
  }
  finally {
    server.kill()
  }
})
after(async () => { await db().prepare(`DROP DATABASE ${testDatabase}`).run(); await closeDatabase(); })
