import { resolve4 } from 'node:dns/promises'
import { request } from 'node:https'
import { isIP } from 'node:net'
import { Readable, Transform } from 'node:stream'
import { media } from '@/config/media'
import { publicAddress } from './connectors'
import { activity, AppError, db, getAgent, transaction } from './store'
// Plot music is fetched by the server so a visitor's browser never contacts the owner's host,
// and so the colony can route it through Web Audio (which needs same-origin audio). Only https
// (or IPFS through the configured gateway), public IPv4 pinned against DNS rebinding, no
// redirects, audio types only and a size cap.
const AUDIO = /^(audio\/(mpeg|mp3|ogg|wav|x-wav|wave|aac|mp4|x-m4a|webm|flac)|application\/ogg)\b/
const EXTENSION = /\.(mp3|ogg|oga|wav|m4a|aac|webm|flac)$/i
export function musicTarget(raw) {
  const resolved = raw.startsWith('ipfs://') ? media.ipfsGateway + raw.slice(7).replace(/^ipfs\//, '') : raw
  let url
  try {
    url = new URL(resolved)
  }
  catch {
    throw new AppError(400, 'invalid')
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || isIP(url.hostname))
    throw new AppError(403, 'permission')
  return { url, ipfs: raw.startsWith('ipfs://') }
}
// IPFS gateways often label uploads generically; a gateway file is accepted as audio when its
// path says so. Elsewhere the server must declare an audio type.
export function audioType(header, path, ipfs) {
  const type = (header || '').toLowerCase()
  if (AUDIO.test(type))
    return type.split(';')[0]
  if ((ipfs || EXTENSION.test(path)) && (type.startsWith('application/octet-stream') || !type))
    return EXTENSION.test(path) ? `audio/${path.match(EXTENSION)[1].toLowerCase().replace('mp3', 'mpeg').replace('m4a', 'mp4').replace('oga', 'ogg')}` : 'audio/mpeg'
  return null
}
export async function streamMusic(raw, signal) {
  const { url, ipfs } = musicTarget(raw)
  const addresses = await resolve4(url.hostname).catch(() => [])
  if (!addresses.length || addresses.some(ip => !publicAddress(ip)))
    throw new AppError(403, 'permission')
  const response = await new Promise((resolve, reject) => {
    const req = request(url, { method: 'GET', family: 4, signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]), lookup: (_h, _o, callback) => callback(null, addresses[0], 4), headers: { Accept: 'audio/*', 'User-Agent': 'Zentra/1.0', 'Accept-Encoding': 'identity' } }, resolve)
    req.on('error', reject)
    req.end()
  }).catch(() => { throw new AppError(502, 'musicUnavailable'); })
  const type = response.statusCode === 200 ? audioType(response.headers['content-type'], url.pathname, ipfs) : null
  const length = Number(response.headers['content-length'] || 0)
  if (!type || length > media.musicMaxBytes) {
    response.destroy()
    throw new AppError(type ? 413 : 502, 'musicUnavailable')
  }
  let total = 0
  const capped = new Transform({ transform(chunk, _e, done) { total += chunk.length; done(total > media.musicMaxBytes ? new Error('size') : null, chunk); } })
  response.on('error', (error) => capped.destroy(error))
  return { body: Readable.toWeb(response.pipe(capped)), type, length: length || undefined }
}
// Uploaded plot music, stored in MySQL in pieces below the server's packet limit.
const PIECE = 256 * 1024
// The file's first bytes decide its type; a name or a declared type is never trusted
export function detectAudio(head) {
  const b = Buffer.from(head.subarray(0, 16)), text = (from, to) => b.toString('latin1', from, to)
  if (text(0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0))
    return 'audio/mpeg'
  if (text(0, 4) === 'OggS')
    return 'audio/ogg'
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WAVE')
    return 'audio/wav'
  if (text(0, 4) === 'fLaC')
    return 'audio/flac'
  if (text(4, 8) === 'ftyp')
    return 'audio/mp4'
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3)
    return 'audio/webm'
  return null
}
export async function musicInfo(agent) {
  const row = await db().prepare('SELECT name, type, size, updated FROM music WHERE agent = ?').get(agent)
  return row ? { name: row.name, type: row.type, size: Number(row.size), updated: Number(row.updated) } : null
}
// Reads the request body, at most the music size cap, then replaces the agent's upload
export async function saveMusicUpload(owner, agent, name, body) {
  await getAgent(owner, agent)
  if (!body)
    throw new AppError(400, 'invalid')
  const reader = body.getReader()
  const parts = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    size += value.byteLength
    if (size > media.musicMaxBytes) {
      await reader.cancel()
      throw new AppError(413, 'musicTooLarge')
    }
    parts.push(value)
  }
  const file = Buffer.concat(parts)
  const type = file.length ? detectAudio(file) : null
  if (!type)
    throw new AppError(415, 'musicType')
  const clean = name.replace(/[\u0000-\u001f\u007f/\\]/g, ' ').trim().slice(0, 200) || 'music'
  await transaction(async () => {
    await getAgent(owner, agent)
    await db().prepare('DELETE FROM music_pieces WHERE agent = ?').run(agent)
    for (let i = 0; i * PIECE < file.length; i++)
      await db().prepare('INSERT INTO music_pieces VALUES (?, ?, ?)').run(agent, i, file.subarray(i * PIECE, (i + 1) * PIECE))
    await db().prepare('INSERT INTO music VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), type = VALUES(type), size = VALUES(size), pieces = VALUES(pieces), updated = VALUES(updated)')
      .run(agent, clean, type, file.length, Math.ceil(file.length / PIECE), Date.now())
    await activity(agent, 'music_uploaded', clean)
  })
  return musicInfo(agent)
}
export async function removeMusicUpload(owner, agent) {
  await transaction(async () => {
    await getAgent(owner, agent)
    await db().prepare('DELETE FROM music_pieces WHERE agent = ?').run(agent)
    await db().prepare('DELETE FROM music WHERE agent = ?').run(agent)
  })
}
// Streams an upload piece by piece, so a long track never sits in memory whole
export async function streamUpload(agent) {
  const info = await db().prepare('SELECT type, size, pieces FROM music WHERE agent = ?').get(agent)
  if (!info)
    return null
  let next = 0
  const body = new ReadableStream({
    async pull(controller) {
      if (next >= Number(info.pieces)) {
        controller.close()
        return
      }
      const row = await db().prepare('SELECT data FROM music_pieces WHERE agent = ? AND idx = ?').get(agent, next++)
      if (!row) {
        controller.error(new Error('missing piece'))
        return
      }
      controller.enqueue(new Uint8Array(row.data))
    },
  })
  return { body, type: info.type, length: Number(info.size) }
}
