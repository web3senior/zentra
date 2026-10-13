import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { resolve4 } from 'node:dns/promises'
import { request } from 'node:https'
import { apiConnectionSchema } from './apiSchema'
import { allowedWebUrl, publicAddress } from './connectors'
import { encryptSecret, decryptSecret } from './providerKeys'
import { activity, AppError, assertRun, db, getAgent, transaction } from './store'
export async function apiState(owner, agent) {
  await getAgent(owner, agent)
  return { connections: (await db().prepare('SELECT id, config FROM api_connections WHERE agent = ?').all(agent)).map(r => ({ id: r.id, ...JSON.parse(r.config) })), requests: await db().prepare('SELECT id, connection, name, url, method, body, status, result, created FROM api_requests WHERE agent = ? ORDER BY created DESC LIMIT 50').all(agent) }
}
export async function saveApi(owner, agent, input) {
  await getAgent(owner, agent)
  const { secret, ...config } = apiConnectionSchema.parse(input)
  const url = new URL(config.url)
  allowedWebUrl(config.url, [url.hostname])
  if (url.search || url.hash || url.hostname.endsWith('.local') || !url.hostname.includes('.'))
    throw new AppError(400, 'invalid')
  config.url = url.href
  return await transaction(async () => {
    const count = await db().prepare('SELECT COUNT(*) AS n FROM api_connections WHERE agent = ?').get(agent)
    if (count.n >= 10)
      throw new AppError(400, 'apiLimit')
    const id = randomUUID()
    await db().prepare('INSERT INTO api_connections VALUES (?, ?, ?, ?)').run(id, agent, JSON.stringify(config), secret && config.auth !== 'none' ? await encryptSecret(`api:${owner}:${agent}:${id}`, secret) : null)
    await activity(agent, 'api_connected', config.name)
    return id
  })
}
export async function removeApi(owner, agent, id) {
  await getAgent(owner, agent)
  await transaction(async () => {
    await db().prepare('DELETE FROM api_connections WHERE agent = ? AND id = ?').run(agent, id)
    await db().prepare("UPDATE api_requests SET status = 'rejected' WHERE agent = ? AND connection = ? AND status = 'pending'").run(agent, id)
    await activity(agent, 'api_removed', '')
  })
}
async function connection(owner, agent, id) {
  if ((await getAgent(owner, agent)).agent.paused)
    throw new AppError(409, 'paused')
  const row = await db().prepare('SELECT config, encrypted FROM api_connections WHERE agent = ? AND id = ?').get(agent, id)
  if (!row)
    throw new AppError(403, 'permission')
  return { config: JSON.parse(row.config), secret: row.encrypted ? await decryptSecret(`api:${owner}:${agent}:${id}`, row.encrypted) : undefined }
}
export function apiTarget(endpoint, query) {
  const url = new URL(endpoint)
  allowedWebUrl(endpoint, [url.hostname])
  if (query.length > 2000)
    throw new AppError(400, 'invalid')
  url.search = new URLSearchParams(query).toString()
  return url
}
// The destination/path/method and auth header are owner-defined, never model-defined.
async function transport(url, method, body, auth, secret, signal, check) {
  const addresses = await resolve4(url.hostname)
  if (!addresses.length || addresses.some(ip => !publicAddress(ip)))
    throw new AppError(403, 'permission')
  await check()
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const headers = { Accept: 'application/json, text/plain, text/html', 'Accept-Encoding': 'identity', 'User-Agent': 'Zentra/1.0' }
    if (secret && auth === 'bearer')
      headers.Authorization = `Bearer ${secret}`
    if (secret && auth === 'x-api-key')
      headers['X-API-Key'] = secret
    if (body) {
      headers['Content-Type'] = 'application/json'
      headers['Content-Length'] = String(Buffer.byteLength(body))
    }
    const req = request(url, { method, headers, family: 4, lookup: (_host, _options, cb) => cb(null, addresses[0], 4), signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) }, response => {
      if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
        response.destroy()
        reject(new AppError(502, 'apiFailed'))
        return
      }
      let length = 0
      const chunks = []
      response.on('data', (chunk) => { length += chunk.length; if (length > 512000) {
        response.destroy()
        reject(new AppError(502, 'apiFailed'))
        return
      } chunks.push(chunk); })
      response.on('error', reject)
      response.on('end', () => { let text = Buffer.concat(chunks).toString('utf8'); if (secret)
        text = text.split(secret).join('[redacted]'); resolve(text.slice(0, 12000)); })
    })
    req.on('error', reject)
    req.end(body || undefined)
  })
}
export async function callApi(owner, agent, run, id, query, body, signal) {
  await assertRun(owner, agent, run)
  const { config } = await connection(owner, agent, id)
  if (body.length > 12000 || (config.method === 'GET' && body))
    throw new AppError(400, 'invalid')
  if (body) {
    try {
      JSON.parse(body)
    }
    catch {
      throw new AppError(400, 'invalid')
    }
  }
  const url = apiTarget(config.url, query)
  const requestId = await transaction(async () => {
    await assertRun(owner, agent, run)
    const count = await db().prepare("SELECT COUNT(*) AS n FROM api_requests WHERE agent = ? AND status = 'pending'").get(agent)
    if (count.n >= 20)
      throw new AppError(429, 'approvalLimit')
    const requestId = randomUUID()
    await db().prepare("INSERT INTO api_requests VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?)").run(requestId, agent, id, config.name, url.href, config.method, body, Date.now())
    await activity(agent, 'api_requested', config.name, run)
    return requestId
  })
  if (config.method === 'GET' && config.autoRead)
    return await executeApi(owner, agent, requestId, signal, () => assertRun(owner, agent, run))
  return { status: 'awaiting_owner_approval', requestId, message: 'Ask the owner to review this exact request under Work → API connections. No request has been sent.' }
}
export const directApiSchema = z.object({
  url: z.string().url().max(2000), method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  body: z.string().max(12000), reason: z.string().min(1).max(200),
  auth: z.enum(['none', 'bearer', 'x-api-key']),
})
// Providers accept only a subset of JSON Schema formats. Validate URL syntax on execution.
export const directApiToolSchema = directApiSchema.extend({ url: z.string().max(2000) })
export async function requestApi(owner, agent, run, input, signal) {
  await assertRun(owner, agent, run)
  const value = directApiSchema.parse(input)
  const url = new URL(value.url)
  allowedWebUrl(value.url, [url.hostname])
  if (url.hash || (value.method === 'GET' && value.body))
    throw new AppError(400, 'invalid')
  if (value.body) {
    try {
      JSON.parse(value.body)
    }
    catch {
      throw new AppError(400, 'invalid')
    }
  }
  const id = await transaction(async () => {
    const count = await db().prepare("SELECT COUNT(*) AS n FROM api_requests WHERE agent = ? AND status = 'pending'").get(agent)
    if (count.n >= 20)
      throw new AppError(429, 'approvalLimit')
    const id = randomUUID()
    await db().prepare("INSERT INTO api_requests VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?)").run(id, agent, 'direct:' + value.auth, value.reason, url.href, value.method, value.body, Date.now())
    await activity(agent, 'api_requested', value.reason, run)
    return id
  })
  if (value.method === 'GET' && value.auth === 'none')
    return await executeApi(owner, agent, id, signal, () => assertRun(owner, agent, run))
  return { status: 'awaiting_owner_approval', requestId: id, message: 'The request is shown in the conversation. Ask the owner to approve it there and provide a credential in the secure field if needed. Never ask for secrets in chat. Nothing has been sent.' }
}
async function requestConnection(owner, agent, row, credential) {
  if (!row.connection.startsWith('direct:'))
    return await connection(owner, agent, row.connection)
  if ((await getAgent(owner, agent)).agent.paused)
    throw new AppError(409, 'paused')
  const auth = row.connection.slice(7)
  if (auth !== 'none' && !credential)
    throw new AppError(400, 'apiCredential')
  return { config: { auth }, secret: credential }
}
export async function executeApi(owner, agent, id, signal, check = () => { }, send = transport, credential) {
  const row = await transaction(async () => {
    const row = await db().prepare('SELECT * FROM api_requests WHERE agent = ? AND id = ?').get(agent, id)
    if (!row)
      throw new AppError(404, 'notFound')
    await requestConnection(owner, agent, row, credential)
    await check()
    if (row.status !== 'pending')
      throw new AppError(409, 'approvalResolved')
    if (row.created < Date.now() - 86400000)
      throw new AppError(409, 'approvalExpired')
    await db().prepare("UPDATE api_requests SET status = 'executing' WHERE id = ?").run(id)
    return row
  })
  try {
    const { config, secret } = await requestConnection(owner, agent, row, credential)
    const result = await send(new URL(row.url), row.method, row.body, config.auth, secret, signal, async () => { await connection(owner, agent, row.connection); await check(); })
    await db().prepare("UPDATE api_requests SET status = 'complete', result = ? WHERE id = ?").run(result, id)
    await activity(agent, 'api_complete', row.name)
    return { status: 'complete', requestId: id, result, untrusted: true }
  }
  catch {
    await db().prepare("UPDATE api_requests SET status = 'uncertain', result = NULL WHERE id = ?").run(id)
    await activity(agent, 'api_uncertain', row.name)
    throw new AppError(502, 'apiFailed')
  }
}
export async function rejectApi(owner, agent, id) {
  await getAgent(owner, agent)
  await db().prepare("UPDATE api_requests SET status = 'rejected' WHERE agent = ? AND id = ? AND status = 'pending'").run(agent, id)
}
