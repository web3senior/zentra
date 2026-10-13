import { resolve4 } from 'node:dns/promises'
import { request } from 'node:https'
import { isIP } from 'node:net'
import { createPublicClient, http, parseAbi } from 'viem'
import { registries } from '@/config/chains'
import { publicAddress } from './connectors'
import { db } from './store'
const now = () => Date.now()
const identityAbi = parseAbi(['function ownerOf(uint256) view returns (address)', 'function tokenURI(uint256) view returns (string)'])
export async function explorerLogs(registry, address) {
  const logs = []
  let params = ''
  for (let page = 0; page < 200; page++) {
    const response = await fetch(`${registry.explorerApi}/addresses/${address}/logs${params ? `?${params}` : ''}`, { signal: AbortSignal.timeout(20000) })
    if (!response.ok)
      throw new Error(`explorer ${response.status}`)
    const data = await response.json()
    logs.push(...data.items)
    if (!data.next_page_params)
      break
    params = new URLSearchParams(Object.entries(data.next_page_params).map(([k, v]) => [k, String(v)])).toString()
  }
  return logs
}
const event = (log) => log.decoded?.method_call.split('(')[0]
const param = (log, name) => log.decoded?.parameters.find(p => p.name === name)?.value
// https only, public IPv4 pinned against DNS rebinding, no redirects, a size and time limit.
// Resolves with the status, headers and body text; non-2xx is the caller's to judge.
export function publicRequest(raw, { method = 'GET', headers = {}, body, limit = 262144, timeout = 10000 } = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const url = new URL(raw)
      if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || isIP(url.hostname))
        throw new Error('url')
      const addresses = await resolve4(url.hostname)
      if (!addresses.length || addresses.some(ip => !publicAddress(ip)))
        throw new Error('address')
      const req = request(url, { method, family: 4, signal: AbortSignal.timeout(timeout), lookup: (_h, _o, callback) => callback(null, addresses[0], 4), headers: { 'User-Agent': 'Zentra/1.0', 'Accept-Encoding': 'identity', ...headers } }, response => {
        const chunks = []
        let length = 0
        response.on('data', (chunk) => { length += chunk.length; if (length > limit) {
          response.destroy()
          reject(new Error('size'))
        }
        else
          chunks.push(chunk); })
        response.on('error', reject)
        response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, text: Buffer.concat(chunks).toString('utf8') }))
      })
      req.on('error', reject)
      req.end(body)
    }
    catch (error) {
      reject(error)
    }
  })
}
// A JSON document over publicRequest: 200 only, 256 KB and 10 s at most
async function publicJson(raw) {
  const response = await publicRequest(raw, { headers: { Accept: 'application/json' } })
  if (response.status !== 200)
    throw new Error('status')
  try {
    return JSON.parse(response.text)
  }
  catch {
    throw new Error('json')
  }
}
export async function registration(registry, uri) {
  if (uri.startsWith('data:')) {
    const match = uri.match(/^data:([^,]*),([\s\S]*)$/)
    if (!match || match[2].length > 200000)
      throw new Error('data')
    return JSON.parse(match[1].includes('base64') ? Buffer.from(match[2], 'base64').toString('utf8') : decodeURIComponent(match[2]))
  }
  if (uri.startsWith('ipfs://'))
    return publicJson(registry.ipfsGateway + uri.slice(7).replace(/^ipfs\//, ''))
  return publicJson(uri)
}
export const text = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : ''
export function cleanRegistration(doc) {
  if (!doc || typeof doc !== 'object')
    return null
  const d = doc
  const name = text(d.name, 60)
  if (!name)
    return null
  const list = Array.isArray(d.services) ? d.services : Array.isArray(d.endpoints) ? d.endpoints : []
  const services = list.flatMap((s) => {
    const url = text(s?.endpoint ?? s?.url, 300)
    try {
      const parsed = new URL(url)
      if (!['https:', 'http:'].includes(parsed.protocol))
        return []
    }
    catch {
      return []
    }
    return [{ name: text(s.name ?? s.type, 40) || 'link', url }]
  }).slice(0, 8)
  return { name, description: text(d.description, 600), active: d.active === true, services }
}
const DAY = 86_400_000
// A registration file shared by more than this many agents is a mass registration: not shown
const REPEATS = 3
// Explorer source: every Registered event gives the ids; reputation events give feedback counts
async function explorerRows(registry, client) {
  const [identityLogs, reputationLogs] = await Promise.all([explorerLogs(registry, registry.identity), explorerLogs(registry, registry.reputation)])
  const ids = [...new Set(identityLogs.filter(l => event(l) === 'Registered').map(l => Number(param(l, 'agentId'))))].filter(Number.isSafeInteger).sort((a, b) => a - b)
  const feedback = new Map()
  for (const log of reputationLogs) {
    const id = Number(param(log, 'agentId'))
    const kind = event(log)
    if (!Number.isSafeInteger(id) || (kind !== 'NewFeedback' && kind !== 'FeedbackRevoked'))
      continue
    const entry = feedback.get(id) ?? { count: 0, last: 0 }
    entry.count += kind === 'NewFeedback' ? 1 : -1
    if (kind === 'NewFeedback')
      entry.last = Math.max(entry.last, log.block_number)
    feedback.set(id, entry)
  }
  return { rows: await readAgents(registry, client, ids), feedback }
}
// RPC source: ids run from 0; find the highest that exists, then read every agent in batches
async function rpcRows(registry, client) {
  const exists = (id) => client.readContract({ address: registry.identity, abi: identityAbi, functionName: 'ownerOf', args: [BigInt(id)] }).then(() => true, () => false)
  const feedback = new Map()
  if (!await exists(0))
    return { rows: [], feedback }
  let low = 0, high = 1024
  while (await exists(high)) {
    low = high
    high *= 2
  }
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2)
    if (await exists(mid))
      low = mid
    else
      high = mid
  }
  return { rows: await readAgents(registry, client, Array.from({ length: low + 1 }, (_, i) => i)), feedback }
}
async function readAgents(registry, client, ids) {
  const rows = []
  for (let i = 0; i < ids.length; i += 300) {
    const batch = ids.slice(i, i + 300)
    const results = await client.multicall({ allowFailure: true, contracts: batch.flatMap(id => [
        { address: registry.identity, abi: identityAbi, functionName: 'ownerOf', args: [BigInt(id)] },
        { address: registry.identity, abi: identityAbi, functionName: 'tokenURI', args: [BigInt(id)] },
      ]) })
    batch.forEach((id, j) => {
      const owner = results[j * 2], uri = results[j * 2 + 1]
      if (owner.status === 'success')
        rows.push({ id, owner: String(owner.result), uri: uri.status === 'success' ? String(uri.result) : '' })
    })
  }
  return rows
}
async function pool(items, size, work) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (next < items.length)
    await work(items[next++]); }))
}
const syncing = new Map()
export async function syncRegistry(registry) {
  const chain = { id: registry.chainId, name: registry.name, nativeCurrency: { name: 'native', symbol: 'N', decimals: 18 }, rpcUrls: { default: { http: [registry.rpc] } }, contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } } }
  const client = createPublicClient({ chain, transport: http(registry.rpc, { timeout: 20000 }) })
  try {
    const { rows, feedback } = registry.source === 'explorer' ? await explorerRows(registry, client) : await rpcRows(registry, client)
    const repeats = new Map()
    for (const row of rows)
      if (row.uri)
        repeats.set(row.uri, (repeats.get(row.uri) ?? 0) + 1)
    const stored = new Map((await db().prepare('SELECT agent_id, uri, doc, synced FROM chain_agents WHERE chain = ?').all(registry.id)).map(r => [r.agent_id, r]))
    const stamp = Date.now()
    const save = await db().prepare('INSERT INTO chain_agents VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE owner = VALUES(owner), uri = VALUES(uri), doc = VALUES(doc), feedback = VALUES(feedback), last_feedback = VALUES(last_feedback), synced = VALUES(synced)')
    // A large registry fetches a file again only when its link changed or a day passed; mass registrations never
    await pool(rows, 12, async (row) => {
      const previous = stored.get(row.id)
      const f = feedback.get(row.id)
      const uri = row.uri.slice(0, 2000)
      let doc = null
      let fetched = stamp
      if (row.uri && (repeats.get(row.uri) ?? 0) <= REPEATS) {
        if (registry.source === 'rpc' && previous && previous.uri === uri && stamp - previous.synced < DAY) {
          doc = previous.doc ? JSON.parse(previous.doc) : null
          fetched = previous.synced
        }
        else
          try {
            doc = cleanRegistration(await registration(registry, row.uri))
          }
          catch {
            doc = null
          }
      }
      save.run(registry.id, row.id, row.owner, uri, doc ? JSON.stringify(doc) : null, Math.max(0, f?.count ?? 0), f?.last || null, fetched)
    })
    const ids = new Set(rows.map(r => r.id))
    for (const id of stored.keys())
      if (!ids.has(id))
        await db().prepare('DELETE FROM chain_agents WHERE chain = ? AND agent_id = ?').run(registry.id, id)
    await db().prepare('INSERT INTO chain_sync VALUES (?, ?, NULL) ON DUPLICATE KEY UPDATE synced = VALUES(synced), error = NULL').run(registry.id, stamp)
  }
  catch (error) {
    await db().prepare('INSERT INTO chain_sync VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE synced = VALUES(synced), error = VALUES(error)').run(registry.id, now(), String(error.message).slice(0, 200))
    throw error
  }
}
// Ranking when a registry has more readable agents than its district shows
const score = (a) => (a.active ? 4 : 0) + Math.min(a.services.length, 4) + Math.min(a.feedback, 10) / 2
// Per chain: the residents to draw and the index's totals. A stale index refreshes in the
// background; a never-synced one is awaited briefly so a fresh install shows agents soon.
export async function chainDistricts() {
  await Promise.all(registries.map(async (registry) => {
    const state = await db().prepare('SELECT synced FROM chain_sync WHERE chain = ?').get(registry.id)
    if (state && now() - state.synced < registry.refreshMinutes * 60_000)
      return
    if (!syncing.has(registry.id))
      syncing.set(registry.id, syncRegistry(registry).catch(() => { }).finally(() => syncing.delete(registry.id)))
    if (!state)
      await Promise.race([syncing.get(registry.id), new Promise(resolve => setTimeout(resolve, 45000))])
  }))
  return Promise.all(registries.map(async (registry) => {
    const all = await db().prepare('SELECT agent_id, owner, doc, feedback, last_feedback FROM chain_agents WHERE chain = ?').all(registry.id)
    const readable = all.filter(row => row.doc).map(row => ({ id: row.agent_id, owner: row.owner, ...JSON.parse(row.doc), feedback: row.feedback, lastFeedbackBlock: row.last_feedback }))
    const agents = readable.length <= registry.shown ? readable
      : readable.filter(a => a.active && a.services.length).sort((a, b) => score(b) - score(a) || b.id - a.id).slice(0, registry.shown).sort((a, b) => a.id - b.id)
    const synced = (await db().prepare('SELECT synced FROM chain_sync WHERE chain = ?').get(registry.id))?.synced ?? null
    const stats = { registered: all.length, readable: readable.length, active: readable.filter(a => a.active).length, shown: agents.length, feedbackIndexed: registry.source === 'explorer' }
    return { id: registry.id, name: registry.name, chainId: registry.chainId, explorer: registry.explorer, scan: registry.scan, logo: registry.logo, identity: registry.identity, reputation: registry.reputation, synced, stats, agents }
  }))
}
