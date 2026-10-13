import { z } from 'zod'
import { chatAreas, chatRules } from '@/config/chat'
import { AppError, db } from './store'
import { userInfo } from './auth'
// People's chat (docs/plans/people-presence-chat.md), after hupsocial's chat rooms: area rooms
// (area:<id>, one per place) and 1:1 rooms (dm:<idA>:<idB>, the two user ids sorted). The realtime
// process is the only writer; the API reads history. Lines are plain text. Only people who chose a
// public name may write; anyone signed in may read area rooms, and only the pair a 1:1 room.
const moderators = () => (process.env.ZENTRA_MODERATORS || '').split(',').map((name) => name.trim().toLowerCase()).filter(Boolean)
export { dmRoom } from '@/lib/chatRooms'
export function roomAccess(owner, room) {
  if (typeof room !== 'string')
    throw new AppError(404, 'notFound')
  const area = room.match(/^area:([a-z0-9-]{1,32})$/)?.[1]
  if (area && chatAreas.includes(area))
    return { kind: 'area', room }
  const pair = room.match(/^dm:([0-9a-f-]{36}):([0-9a-f-]{36})$/)
  if (pair && pair[1] < pair[2] && (owner === pair[1] || owner === pair[2]))
    return { kind: 'dm', room, other: owner === pair[1] ? pair[2] : pair[1] }
  throw new AppError(404, 'notFound')
}
// Who may write: a chosen public name, not muted
export async function writer(owner) {
  const me = await userInfo(owner)
  if (!me?.named)
    throw new AppError(403, 'chatName')
  const mute = await db().prepare('SELECT until FROM chat_mutes WHERE user = ? AND until > ?').get(owner, Date.now())
  if (mute)
    throw new AppError(403, 'chatMuted')
  return { ...me, id: owner, moderator: moderators().includes(me.username) }
}
export async function blockedBetween(a, b) {
  return !!await db().prepare('SELECT 1 FROM chat_blocks WHERE (user = ? AND blocked = ?) OR (user = ? AND blocked = ?) LIMIT 1').get(a, b, b, a)
}
export async function blockedBy(owner) {
  return new Set((await db().prepare('SELECT blocked FROM chat_blocks WHERE user = ?').all(owner)).map((row) => row.blocked))
}
// In-memory limits: the realtime process is the single writer, so its memory is the whole picture
const recent = new Map()
function limit(key, max, windowMs) {
  const now = Date.now()
  const hits = (recent.get(key) ?? []).filter((at) => now - at < windowMs)
  if (hits.length >= max)
    throw new AppError(429, 'chatRate')
  hits.push(now)
  recent.set(key, hits)
}
const bodySchema = z.string().trim().min(1).max(chatRules.bodyMax)
const LINE = `SELECT m.id, m.room, m.sender, u.username AS name, EXISTS (SELECT 1 FROM user_wallets w WHERE w.owner = m.sender AND w.up = 1) AS up,
  m.body, m.reply_to, m.created, m.edited, m.deleted FROM chat_messages m JOIN users u ON u.id = m.sender`
async function reactionsFor(ids) {
  if (!ids.length)
    return new Map()
  const rows = await db().prepare(`SELECT message, emoji, user FROM chat_reactions WHERE message IN (${ids.map(() => '?').join(',')})`).all(...ids)
  const out = new Map()
  for (const row of rows) {
    const byEmoji = out.get(row.message) ?? {}
    ;(byEmoji[row.emoji] ??= []).push(row.user)
    out.set(row.message, byEmoji)
  }
  return out
}
// A line as clients see it; a deleted line keeps its place with no text
const serialize = (row, reactions) => ({
  id: Number(row.id), room: row.room, sender: { id: row.sender, name: row.name, up: !!row.up },
  body: row.deleted ? '' : row.body, replyTo: row.reply_to == null ? null : Number(row.reply_to),
  created: Number(row.created), edited: row.edited == null ? null : Number(row.edited), deleted: row.deleted != null,
  reactions: row.deleted ? {} : reactions?.get(row.id) ?? {},
})
export async function lineById(id) {
  const row = await db().prepare(`${LINE} WHERE m.id = ?`).get(id)
  return row && serialize(row, await reactionsFor([row.id]))
}
// Older lines, oldest first, without people the reader blocked
export async function history(owner, room, before) {
  roomAccess(owner, room)
  const blocked = await blockedBy(owner)
  const cursor = Number.isSafeInteger(Number(before)) && Number(before) > 0 ? Number(before) : Number.MAX_SAFE_INTEGER
  const rows = (await db().prepare(`${LINE} WHERE m.room = ? AND m.id < ? ORDER BY m.id DESC LIMIT ${chatRules.pageSize}`).all(room, cursor)).filter((row) => !blocked.has(row.sender))
  const reactions = await reactionsFor(rows.map((row) => row.id))
  return { lines: rows.reverse().map((row) => serialize(row, reactions)), more: rows.length === chatRules.pageSize }
}
const conversations = new Map()
export async function postMessage(owner, input) {
  const { room, body, replyTo } = z.object({ room: z.string().max(100), body: bodySchema, replyTo: z.number().int().positive().nullish() }).parse(input)
  const access = roomAccess(owner, room)
  const me = await writer(owner)
  if (access.kind === 'dm') {
    if (await blockedBetween(owner, access.other))
      throw new AppError(403, 'chatBlocked')
    if (!(await userInfo(access.other))?.named)
      throw new AppError(404, 'notFound')
    // A first line to someone counts as a new conversation
    if (!await db().prepare('SELECT 1 FROM chat_messages WHERE room = ? LIMIT 1').get(room)) {
      const key = `${owner}:${room}`
      if (!conversations.has(key)) {
        limit(`conversations:${owner}`, chatRules.newConversationsPerHour, 3_600_000)
        conversations.set(key, true)
      }
    }
  }
  limit(`messages:${owner}`, chatRules.messagesPerMinute, 60_000)
  const reply = replyTo ? await db().prepare('SELECT id FROM chat_messages WHERE id = ? AND room = ?').get(replyTo, room) : null
  await db().prepare('INSERT INTO chat_messages (room, sender, body, reply_to, created) VALUES (?, ?, ?, ?, ?)').run(room, owner, body, reply ? replyTo : null, Date.now())
  const row = await db().prepare(`${LINE} WHERE m.room = ? AND m.sender = ? ORDER BY m.id DESC LIMIT 1`).get(room, owner)
  if (access.kind === 'area')
    await prune(room)
  await markRead(owner, room, Number(row.id))
  return { line: serialize(row, new Map()), access, me }
}
// Area rooms keep their newest lines, as hupsocial's rooms do; 1:1 rooms are kept
async function prune(room) {
  const edge = await db().prepare(`SELECT id FROM chat_messages WHERE room = ? ORDER BY id DESC LIMIT 1 OFFSET ${chatRules.areaRetention}`).get(room)
  if (edge)
    await db().prepare('DELETE FROM chat_messages WHERE room = ? AND id <= ?').run(room, edge.id)
}
export async function editMessage(owner, input) {
  const { id, body } = z.object({ id: z.number().int().positive(), body: bodySchema }).parse(input)
  await writer(owner)
  const row = await db().prepare('SELECT sender, deleted FROM chat_messages WHERE id = ?').get(id)
  if (!row || row.deleted)
    throw new AppError(404, 'notFound')
  if (row.sender !== owner)
    throw new AppError(403, 'chatNotYours')
  await db().prepare('UPDATE chat_messages SET body = ?, edited = ? WHERE id = ?').run(body, Date.now(), id)
  return lineById(id)
}
// Your own line, or any area line for a moderator
export async function deleteMessage(owner, input) {
  const { id } = z.object({ id: z.number().int().positive() }).parse(input)
  const me = await userInfo(owner)
  const moderator = moderators().includes(me?.username)
  const row = await db().prepare('SELECT id, room, sender, deleted FROM chat_messages WHERE id = ?').get(id)
  if (!row || row.deleted)
    throw new AppError(404, 'notFound')
  if (row.sender !== owner && !(moderator && row.room.startsWith('area:')))
    throw new AppError(403, 'chatNotYours')
  await db().prepare('UPDATE chat_messages SET deleted = ?, deleted_by = ? WHERE id = ?').run(Date.now(), owner, id)
  await db().prepare('DELETE FROM chat_reactions WHERE message = ?').run(id)
  return lineById(id)
}
export async function react(owner, input) {
  const { id, emoji } = z.object({ id: z.number().int().positive(), emoji: z.enum(chatRules.reactions) }).parse(input)
  await writer(owner)
  const row = await db().prepare('SELECT room, deleted FROM chat_messages WHERE id = ?').get(id)
  if (!row || row.deleted)
    throw new AppError(404, 'notFound')
  roomAccess(owner, row.room)
  limit(`messages:${owner}`, chatRules.messagesPerMinute * 3, 60_000)
  const removed = await db().prepare('DELETE FROM chat_reactions WHERE message = ? AND user = ? AND emoji = ?').run(id, owner, emoji)
  if (!removed.changes)
    await db().prepare('INSERT INTO chat_reactions VALUES (?, ?, ?)').run(id, owner, emoji)
  return lineById(id)
}
export async function markRead(owner, room, id) {
  roomAccess(owner, room)
  await db().prepare('INSERT INTO chat_reads VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE last_id = GREATEST(last_id, VALUES(last_id))').run(owner, room, id)
}
// 1:1 conversations, newest first, with the other person and the unread count
export async function directConversations(owner) {
  const rows = await db().prepare(`SELECT m.room, MAX(m.id) AS last FROM chat_messages m WHERE m.room LIKE 'dm:%' AND (m.room LIKE ? OR m.room LIKE ?) GROUP BY m.room ORDER BY last DESC LIMIT 50`).all(`dm:${owner}:%`, `dm:%:${owner}`)
  const blocked = await blockedBy(owner)
  const out = []
  for (const row of rows) {
    const { other } = roomAccess(owner, row.room)
    if (blocked.has(other))
      continue
    const person = await userInfo(other)
    const read = (await db().prepare('SELECT last_id FROM chat_reads WHERE user = ? AND room = ?').get(owner, row.room))?.last_id ?? 0
    const unread = (await db().prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE room = ? AND id > ? AND sender <> ? AND deleted IS NULL').get(row.room, read, owner)).n
    out.push({ room: row.room, with: { id: other, name: person?.username ?? '', up: !!person?.up }, last: await lineById(row.last), unread: Number(unread) })
  }
  return out
}
export async function setBlock(owner, input) {
  const { user, blocked } = z.object({ user: z.uuid(), blocked: z.boolean() }).parse(input)
  if (user === owner)
    throw new AppError(400, 'invalid')
  if (blocked)
    await db().prepare('INSERT IGNORE INTO chat_blocks VALUES (?, ?, ?)').run(owner, user, Date.now())
  else
    await db().prepare('DELETE FROM chat_blocks WHERE user = ? AND blocked = ?').run(owner, user)
  return { blocked: [...await blockedBy(owner)] }
}
export async function report(owner, input) {
  const { id, reason } = z.object({ id: z.number().int().positive(), reason: z.string().trim().min(1).max(500) }).parse(input)
  const row = await db().prepare('SELECT room FROM chat_messages WHERE id = ?').get(id)
  if (!row)
    throw new AppError(404, 'notFound')
  roomAccess(owner, row.room)
  limit(`reports:${owner}`, 10, 3_600_000)
  await db().prepare('INSERT INTO chat_reports (message, reporter, reason, created) VALUES (?, ?, ?, ?)').run(id, owner, reason, Date.now())
}
// Moderators mute a person for chatRules.muteHours
export async function mute(owner, input) {
  const { user } = z.object({ user: z.uuid() }).parse(input)
  const me = await userInfo(owner)
  if (!moderators().includes(me?.username))
    throw new AppError(403, 'chatNotYours')
  await db().prepare('INSERT INTO chat_mutes VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE until = VALUES(until), by_user = VALUES(by_user)').run(user, Date.now() + chatRules.muteHours * 3_600_000, owner)
}
export const isModerator = async (owner) => moderators().includes((await userInfo(owner))?.username)
