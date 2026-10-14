// Zentra's realtime process (docs/plans/people-presence-chat.md): people walking together and live
// chat. One WebSocket endpoint (/ws, port ZENTRA_REALTIME_PORT, default 3011) beside the Next app.
// The zentra_session cookie, or a ticket from the site when this runs on another host
// (NEXT_PUBLIC_REALTIME_URL), signs a connection in; without either a visitor only watches. Positions
// live in memory only. Chat lines are written through lib/zentra/chat.js (Zentra's MySQL).
// Run: pnpm realtime (development uses the dev server's local certificate for wss).
import { existsSync, readFileSync } from 'node:fs'
import { createServer as createHttp } from 'node:http'
import { createServer as createHttps } from 'node:https'
import { WebSocketServer } from 'ws'
import { chatRules } from '@/config/chat'
import { AppError } from '@/lib/zentra/store'
import { ownerFromRequest, ownerFromTicket, userInfo } from '@/lib/zentra/auth'
import { blockedBy, deleteMessage, editMessage, postMessage, react, roomAccess } from '@/lib/zentra/chat'

// Same settings as the site: .env.local, then .env (variables already set win). Read before the
// first database or key use, which happens on connection, not at import
for (const file of ['.env.local', '.env'])
  if (existsSync(file))
    process.loadEnvFile(file)

const PORT = Number(process.env.ZENTRA_REALTIME_PORT || 3011)
const TICK = 100
const IDLE = 30_000
const dev = process.env.NODE_ENV !== 'production'
// Pages allowed to connect: the site's own origin (and the dev server's)
const origins = new Set([process.env.ZENTRA_APP_ORIGIN, process.env.NEXT_PUBLIC_BASE_URL, ...(dev ? ['https://localhost:3010', 'http://localhost:3010'] : [])].filter(Boolean))

function server() {
  const cert = process.env.ZENTRA_REALTIME_CERT || (dev && 'certificates/localhost.pem')
  const key = process.env.ZENTRA_REALTIME_KEY || (dev && 'certificates/localhost-key.pem')
  // Production runs plain HTTP behind nginx, which terminates TLS for /ws
  if (cert && key && existsSync(cert) && existsSync(key))
    return createHttps({ cert: readFileSync(cert), key: readFileSync(key) })
  return createHttp()
}
const http = server()
const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 8192 })

const clients = new Set()
// Walking people by user id: their latest pose, never stored
const people = new Map()
let dirty = false

const send = (client, message) => { if (client.socket.readyState === 1) client.socket.send(JSON.stringify(message)) }
const visibleTo = (client, person) => person.id !== client.owner && !client.blocked.has(person.id)
const peopleFor = (client) => [...people.values()].filter((person) => visibleTo(client, person)).map(({ id, name, up, x, y, z, f, m }) => ({ id, name, up, x, y, z, f, m }))
function remove(owner) {
  if (people.delete(owner))
    for (const client of clients)
      send(client, { t: 'gone', id: owner })
}
// A line reaches everyone in its room who has not blocked its writer; 1:1 lines reach both people
// on every connection, joined or not, so unread counts stay live
function deliver(line, access, type = 'line') {
  for (const client of clients) {
    if (!client.owner || client.blocked.has(line.sender.id))
      continue
    const member = access.kind === 'dm' ? line.room.includes(client.owner) : client.rooms.has(line.room)
    if (member)
      send(client, { t: type, line })
  }
}
const finite = (value, max) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max

async function handle(client, message) {
  const { owner } = client
  switch (message.t) {
  case 'move': {
    if (!owner || !client.me?.named)
      return
    // At most movesPerSecond; extra updates are dropped
    const now = Date.now()
    if (now - client.moveWindow >= 1000) {
      client.moveWindow = now
      client.moves = 0
    }
    if (++client.moves > chatRules.movesPerSecond || !finite(message.x, 5000) || !finite(message.z, 5000) || !finite(message.y, 100) || !finite(message.f, 100))
      return
    people.set(owner, { id: owner, name: client.me.username, up: client.me.up, x: message.x, y: message.y, z: message.z, f: message.f, m: !!message.m, at: now })
    dirty = true
    return
  }
  case 'leave':
    if (owner)
      remove(owner)
    return
  case 'join':
    if (!owner)
      throw new AppError(401, 'signIn')
    roomAccess(owner, message.room)
    client.rooms.add(message.room)
    return
  case 'part':
    client.rooms.delete(message.room)
    return
  case 'typing': {
    if (!owner || !client.me?.named || !client.rooms.has(message.room))
      return
    const now = Date.now()
    if (now - client.typedAt < 2000)
      return
    client.typedAt = now
    for (const other of clients)
      if (other !== client && other.rooms.has(message.room) && !other.blocked.has(owner))
        send(other, { t: 'typing', room: message.room, id: owner, name: client.me.username })
    return
  }
  case 'say': {
    if (!owner)
      throw new AppError(401, 'signIn')
    const { line, access } = await postMessage(owner, { room: message.room, body: message.body, replyTo: message.replyTo ?? null })
    deliver(line, access)
    send(client, { t: 'sent', ref: message.ref, id: line.id })
    return
  }
  case 'edit': case 'delete': case 'react': {
    if (!owner)
      throw new AppError(401, 'signIn')
    const work = message.t === 'edit' ? editMessage : message.t === 'delete' ? deleteMessage : react
    const line = await work(owner, message)
    deliver(line, { kind: line.room.startsWith('dm:') ? 'dm' : 'area' }, 'update')
    return
  }
  case 'blocks':
    // The person changed their block list over the API: reload it and hide the people now blocked
    if (owner) {
      client.blocked = await blockedBy(owner)
      dirty = true
    }
    return
  }
}

wss.on('connection', async (socket, request) => {
  if (!origins.has(request.headers.origin)) {
    socket.close(1008, 'origin')
    return
  }
  // Signed in by the session cookie (same host), or by a ticket from the site (another host)
  let owner = ownerFromTicket(new URL(request.url, 'http://realtime').searchParams.get('ticket'))
  if (!owner) {
    try {
      owner = await ownerFromRequest({ headers: new Headers({ cookie: request.headers.cookie || '' }) })
    }
    catch { /* a visitor: watches only */ }
  }
  const client = { socket, owner, me: owner ? await userInfo(owner) : null, rooms: new Set(), blocked: owner ? await blockedBy(owner) : new Set(), moveWindow: 0, moves: 0, typedAt: 0, alive: true }
  clients.add(client)
  send(client, { t: 'welcome', you: owner && client.me ? { id: owner, name: client.me.username, up: client.me.up, named: client.me.named } : null, people: peopleFor(client) })
  socket.on('pong', () => { client.alive = true })
  socket.on('message', async (data) => {
    let message
    try {
      message = JSON.parse(String(data))
    }
    catch {
      return
    }
    try {
      await handle(client, message)
    }
    catch (error) {
      const code = error instanceof AppError ? error.code : error?.name === 'ZodError' ? 'invalid' : 'serverError'
      if (!(error instanceof AppError) && error?.name !== 'ZodError')
        console.error('[realtime]', error)
      send(client, { t: 'error', ref: message?.ref, code })
    }
  })
  socket.on('close', () => {
    clients.delete(client)
    // Gone when their last connection closes
    if (owner && ![...clients].some((other) => other.owner === owner))
      remove(owner)
  })
})

// Positions go out ten times a second, only when something moved; idle walkers time out
setInterval(() => {
  const now = Date.now()
  for (const person of people.values())
    if (now - person.at > IDLE)
      remove(person.id)
  if (!dirty)
    return
  dirty = false
  for (const client of clients)
    send(client, { t: 'people', list: peopleFor(client) })
}, TICK)
// Dead connections are dropped
setInterval(() => {
  for (const client of clients) {
    if (!client.alive) {
      client.socket.terminate()
      continue
    }
    client.alive = false
    client.socket.ping()
  }
}, 30_000)

http.listen(PORT, () => console.log(`[realtime] listening on ${PORT}`))
