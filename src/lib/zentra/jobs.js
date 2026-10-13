import { createPublicClient, decodeEventLog, http, parseAbi } from 'viem'
import { registries } from '@/config/chains'
import { explorerLogs, registration, text } from './registry'
import { db } from './store'
// The colony's job board: Hup Tasks bounties, read-only. Logs say which posts carry a task, who
// was paid and how a task closed; the contract's getTask gives its current state. The brief is
// the Hup post's own text. Everything here is written by strangers: capped plain text, never
// shown as HTML, never put in a hosted agent's prompt.
const abi = parseAbi([
  'event TaskPosted(uint256 indexed postId, address indexed poster, address paymentToken, bool isLsp7, uint256 rewardPerSlot, uint32 slots, uint64 deadline, uint16 feeBps, string category, bytes taskPubKey)',
  'event SlotPaid(uint256 indexed postId, uint256 indexed replyId, address indexed worker, uint256 amount, uint256 feeAmount, uint256 agentId, uint8 rating, bool feedbackGiven, bytes revealKey)',
  'event TaskCancelled(uint256 indexed postId, address indexed poster, uint256 refunded)',
  'event TaskReclaimed(uint256 indexed postId, address indexed poster, uint256 refunded)',
  'function getTask(uint256 _postId) view returns ((address poster, uint64 deadline, uint32 slots, address paymentToken, uint32 paidSlots, uint16 feeBps, bool isLsp7, bool isSealed, bool closed, bool hidden, uint64 createdAt, uint256 rewardPerSlot, uint256 feePerSlot, string category))',
  'function getContent(uint256 _id, address _viewer) view returns ((uint256 id, uint8 cType, string metadata, uint256 parentId, uint256 createdAt, address creator, uint256 likeCount, uint256 commentCount, uint256 repostCount, bool isDeleted, bool isUpdated, bool allowedComments, bool hasLiked))',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
])
const ZERO = '0x0000000000000000000000000000000000000000'
const BRIEF = 400
const now = () => Date.now()
// Explorer log items (topics, data, block_number) to tasks posted, payouts and closings
export function decodeJobLogs(logs) {
  const posted = new Map(), payouts = [], closed = new Map()
  for (const log of logs) {
    let event
    try {
      event = decodeEventLog({ abi, topics: log.topics.filter(Boolean), data: log.data })
    }
    catch {
      continue
    }
    const { eventName, args } = event
    const post = args.postId.toString()
    if (eventName === 'TaskPosted')
      posted.set(post, { post, block: log.block_number })
    else if (eventName === 'SlotPaid')
      payouts.push({ post, reply: args.replyId.toString(), worker: args.worker, amount: args.amount.toString(), agentId: args.agentId.toString(), rating: args.rating })
    else
      closed.set(post, eventName === 'TaskCancelled' ? 'cancelled' : 'reclaimed')
  }
  return { posted: [...posted.values()], payouts, closed }
}
// Open until the deadline, then in review until the poster approves or reclaims, then done
export function jobStatus(job, at = now()) {
  if (job.closed || job.paid >= job.slots)
    return 'done'
  return job.deadline * 1000 <= at ? 'review' : 'open'
}
// A Hup post document: the first text element is the brief. Markdown marks are dropped.
export function cleanBrief(doc) {
  const raw = Array.isArray(doc?.elements) ? doc.elements.find((element) => element?.type === 'text')?.data?.text : undefined
  const full = text(typeof raw === 'string' ? raw.replace(/[*_`#]+/g, '').replace(/^>\s?/gm, '') : '', 4000).replace(/\s+/g, ' ')
  return full.length > BRIEF ? `${full.slice(0, BRIEF - 1).trimEnd()}…` : full || null
}
async function brief(registry, uri) {
  if (typeof uri !== 'string' || !uri.startsWith('ipfs://'))
    return null
  try {
    return cleanBrief(await registration(registry, uri))
  }
  catch {
    return null
  }
}
const clientFor = (registry) => createPublicClient({
  chain: { id: registry.chainId, name: registry.name, nativeCurrency: { name: 'native', symbol: 'N', decimals: 18 }, rpcUrls: { default: { http: [registry.rpc] } }, contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } } },
  transport: http(registry.rpc, { timeout: 20000 }),
})
// Symbol and decimals of each payment token, read once. A token that answers neither keeps
// nulls, and its amounts are not shown rather than guessed.
async function tokens(registry, client, addresses) {
  const known = new Set((await db().prepare('SELECT address FROM chain_tokens WHERE chain = ?').all(registry.id)).map((row) => row.address))
  const fresh = addresses.filter((address) => address !== ZERO && !known.has(address))
  if (!fresh.length)
    return
  const results = await client.multicall({ allowFailure: true, contracts: fresh.flatMap((address) => [
      { address, abi, functionName: 'symbol' },
      { address, abi, functionName: 'decimals' },
    ]) })
  for (const [i, address] of fresh.entries()) {
    const symbol = results[i * 2].status === 'success' ? text(results[i * 2].result, 16) || null : null
    const decimals = results[i * 2 + 1].status === 'success' ? Number(results[i * 2 + 1].result) : null
    await db().prepare('INSERT INTO chain_tokens VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE symbol = VALUES(symbol), decimals = VALUES(decimals)').run(registry.id, address, symbol, decimals)
  }
}
const syncKey = (registry) => `${registry.id}:jobs`
export async function syncJobs(registry) {
  const { jobs } = registry
  const client = clientFor(registry)
  try {
    const { posted, payouts, closed } = decodeJobLogs(await explorerLogs(registry, jobs.tasks))
    const state = posted.length ? await client.multicall({ allowFailure: true, contracts: posted.map(({ post }) => ({ address: jobs.tasks, abi, functionName: 'getTask', args: [BigInt(post)] })) }) : []
    const briefs = new Map((await db().prepare('SELECT post_id, brief FROM chain_jobs WHERE chain = ?').all(registry.id)).map((row) => [String(row.post_id), row.brief]))
    const missing = posted.filter(({ post }) => !briefs.get(post))
    const content = missing.length ? await client.multicall({ allowFailure: true, contracts: missing.map(({ post }) => ({ address: jobs.hup, abi, functionName: 'getContent', args: [BigInt(post), ZERO] })) }) : []
    for (const [i, { post }] of missing.entries())
      briefs.set(post, content[i].status === 'success' ? await brief(registry, content[i].result.metadata) : null)
    const save = 'INSERT INTO chain_jobs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE poster = VALUES(poster), token = VALUES(token), reward = VALUES(reward), slots = VALUES(slots), paid = VALUES(paid), deadline = VALUES(deadline), category = VALUES(category), sealed = VALUES(sealed), closed = VALUES(closed), hidden = VALUES(hidden), brief = VALUES(brief), block = VALUES(block)'
    const addresses = new Set()
    for (const [i, { post, block }] of posted.entries()) {
      if (state[i].status !== 'success')
        continue
      const task = state[i].result
      const token = task.paymentToken.toLowerCase()
      addresses.add(token)
      await db().prepare(save).run(registry.id, post, task.poster, token, task.rewardPerSlot.toString(), task.slots, task.paidSlots, Number(task.deadline), text(task.category, 32) || 'other', task.isSealed ? 1 : 0, task.closed ? closed.get(post) ?? 'closed' : '', task.hidden ? 1 : 0, briefs.get(post) ?? null, block)
    }
    for (const payout of payouts)
      await db().prepare('INSERT IGNORE INTO chain_job_payouts VALUES (?, ?, ?, ?, ?, ?, ?)').run(registry.id, payout.post, payout.reply, payout.worker, payout.amount, payout.agentId, payout.rating)
    await tokens(registry, client, [...addresses])
    await db().prepare('INSERT INTO chain_sync VALUES (?, ?, NULL) ON DUPLICATE KEY UPDATE synced = VALUES(synced), error = NULL').run(syncKey(registry), now())
  }
  catch (error) {
    await db().prepare('INSERT INTO chain_sync VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE synced = VALUES(synced), error = VALUES(error)').run(syncKey(registry), now(), String(error.message).slice(0, 200))
    throw error
  }
}
const syncing = new Map()
// Per chain with a job board: open jobs (soonest deadline first), then recent finished ones. A
// stale index refreshes in the background; a never-synced one is awaited briefly.
export async function chainJobs() {
  const boards = registries.filter((registry) => registry.jobs)
  await Promise.all(boards.map(async (registry) => {
    const state = await db().prepare('SELECT synced FROM chain_sync WHERE chain = ?').get(syncKey(registry))
    if (state && now() - state.synced < registry.jobs.refreshMinutes * 60_000)
      return
    if (!syncing.has(registry.id))
      syncing.set(registry.id, syncJobs(registry).catch(() => { }).finally(() => syncing.delete(registry.id)))
    if (!state)
      await Promise.race([syncing.get(registry.id), new Promise((resolve) => setTimeout(resolve, 45000))])
  }))
  return Promise.all(boards.map(async (registry) => {
    const rows = await db().prepare('SELECT * FROM chain_jobs WHERE chain = ? AND hidden = 0 ORDER BY block DESC').all(registry.id)
    const paid = await db().prepare('SELECT post_id, reply_id, worker, amount, agent_id, rating FROM chain_job_payouts WHERE chain = ?').all(registry.id)
    const tokenRows = new Map((await db().prepare('SELECT address, symbol, decimals FROM chain_tokens WHERE chain = ?').all(registry.id)).map((row) => [row.address, row]))
    const tokenOf = (address) => address === ZERO ? registry.native : tokenRows.get(address)?.symbol && tokenRows.get(address)?.decimals != null ? { symbol: tokenRows.get(address).symbol, decimals: tokenRows.get(address).decimals } : null
    const jobs = rows.map((row) => {
      const job = { id: String(row.post_id), poster: row.poster, token: tokenOf(row.token), reward: row.reward, slots: row.slots, paid: row.paid, deadline: Number(row.deadline), category: row.category, sealed: !!row.sealed, closed: row.closed, brief: row.brief, url: `${registry.jobs.post}${row.post_id}`,
        payouts: paid.filter((p) => p.post_id === row.post_id).map((p) => ({ reply: String(p.reply_id), worker: p.worker, amount: p.amount, agentId: Number(p.agent_id), rating: p.rating })) }
      return { ...job, status: jobStatus(job) }
    })
    const active = jobs.filter((job) => job.status !== 'done').sort((a, b) => a.deadline - b.deadline)
    const finished = jobs.filter((job) => job.status === 'done').slice(0, registry.jobs.finished)
    const synced = (await db().prepare('SELECT synced FROM chain_sync WHERE chain = ?').get(syncKey(registry)))?.synced ?? null
    return { id: registry.id, name: registry.name, explorer: registry.explorer, contract: registry.jobs.tasks, synced, open: active.filter((job) => job.status === 'open').length, jobs: [...active, ...finished] }
  }))
}
