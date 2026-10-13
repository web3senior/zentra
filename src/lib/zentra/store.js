import { randomUUID } from 'node:crypto'
import { agentSchema } from './schema'
import { db, transaction } from './database'
export { db, transaction }
export class AppError extends Error {
  status
  code
  constructor(status, code) {
    super(code)
    this.status = status
    this.code = code
  }
}
const day = () => new Date().toISOString().slice(0, 10)
async function present(row) {
  const usage = await db().prepare('SELECT COUNT(*) AS count FROM runs WHERE agent = ? AND day = ?').get(row.id, day())
  return { ...agentSchema.parse(JSON.parse(row.config)), id: row.id, createdAt: Number(row.created), runsToday: Number(usage.count) }
}
export async function getAgent(owner, id) {
  const row = await db().prepare('SELECT * FROM agents WHERE owner = ? AND id = ?').get(owner, id)
  if (!row)
    throw new AppError(404, 'notFound')
  return { agent: await present(row), memory: row.memory }
}
export async function listAgents(owner) {
  const rows = await db().prepare('SELECT * FROM agents WHERE owner = ? ORDER BY created').all(owner)
  return Promise.all(rows.map(present))
}
export async function createAgent(owner, config) {
  return transaction(async () => {
    if ((await listAgents(owner)).length >= 50)
      throw new AppError(409, 'agentLimit')
    const id = randomUUID()
    await db().prepare("INSERT INTO agents (id, owner, config, created, memory) VALUES (?, ?, ?, ?, '')").run(id, owner, JSON.stringify(config), Date.now())
    return (await getAgent(owner, id)).agent
  })
}
export async function busy(id) {
  return !!await db().prepare("SELECT id FROM runs WHERE agent = ? AND status = 'running' AND expires > ?").get(id, Date.now())
}
export async function updateAgent(owner, id, config) {
  return transaction(async () => {
    await getAgent(owner, id)
    if (await busy(id))
      throw new AppError(409, 'busy')
    await db().prepare('UPDATE agents SET config = ? WHERE owner = ? AND id = ?').run(JSON.stringify(config), owner, id)
    return (await getAgent(owner, id)).agent
  })
}
export async function removeAgent(owner, id) {
  await transaction(async () => {
    await getAgent(owner, id)
    if (await busy(id))
      throw new AppError(409, 'busy')
    await db().prepare('DELETE FROM agents WHERE owner = ? AND id = ?').run(owner, id)
  })
}
export async function messages(owner, id) {
  await getAgent(owner, id)
  const rows = await db().prepare('SELECT id, role, content, createdAt FROM (SELECT id, role, content, created AS createdAt, seq FROM messages WHERE agent = ? ORDER BY created DESC, seq DESC LIMIT 100) AS recent ORDER BY createdAt, seq').all(id)
  return rows.map(m => ({ ...m, createdAt: Number(m.createdAt) }))
}
export async function setMemory(owner, id, memory, runId) {
  await transaction(async () => {
    await getAgent(owner, id)
    if (memory.length > 12000)
      throw new AppError(400, 'invalid')
    if (runId)
      await assertRun(owner, id, runId)
    else if (await busy(id))
      throw new AppError(409, 'busy')
    await db().prepare('UPDATE agents SET memory = ? WHERE owner = ? AND id = ?').run(memory, owner, id)
    await activity(id, 'memory_saved', '', runId)
  })
}
export async function assertRun(owner, id, runId) {
  const { agent } = await getAgent(owner, id)
  const run = await db().prepare("SELECT id FROM runs WHERE id = ? AND agent = ? AND status = 'running' AND expires > ?").get(runId, id, Date.now())
  if (!run || agent.paused)
    throw new AppError(409, 'stopped')
}
export async function activity(id, kind, detail, run) {
  await db().prepare('INSERT INTO activity (id, agent, run, kind, detail, created) VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), id, run || null, kind, detail.slice(0, 1000), Date.now())
}
export async function beginRun(owner, id, runId, content, jobId) {
  return transaction(async () => {
    const { agent } = await getAgent(owner, id)
    if (jobId && !await db().prepare("SELECT id FROM jobs WHERE id = ? AND agent = ? AND run = ? AND status = 'running' AND lease > ?").get(jobId, id, runId, Date.now()))
      throw new AppError(409, 'stopped')
    if (await db().prepare('SELECT id FROM runs WHERE id = ?').get(runId))
      throw new AppError(409, 'duplicate')
    if (agent.paused)
      throw new AppError(409, 'paused')
    if (await busy(id))
      throw new AppError(409, 'busy')
    if (agent.runsToday >= agent.dailyRuns)
      throw new AppError(429, 'quota')
    await db().prepare("UPDATE runs SET status = 'interrupted' WHERE agent = ? AND status = 'running'").run(id)
    await db().prepare("INSERT INTO runs (id, agent, day, status, expires) VALUES (?, ?, ?, 'running', ?)").run(runId, id, day(), Date.now() + 100000)
    await db().prepare("INSERT INTO messages (id, agent, role, content, created) VALUES (?, ?, 'user', ?, ?)").run(randomUUID(), id, content, Date.now())
    await activity(id, 'run_started', agent.provider + ' / ' + agent.model, runId)
    return agent
  })
}
export async function finishRun(owner, id, runId, content, tokens) {
  await transaction(async () => {
    await assertRun(owner, id, runId)
    await db().prepare("INSERT INTO messages (id, agent, role, content, created) VALUES (?, ?, 'assistant', ?, ?)").run(randomUUID(), id, content, Date.now())
    await db().prepare("UPDATE runs SET status = 'complete', tokens = ? WHERE id = ?").run(tokens, runId)
    await db().prepare('INSERT INTO run_results VALUES (?, ?)').run(runId, content)
    await activity(id, 'run_complete', String(tokens), runId)
  })
}
export async function failRun(runId) {
  await db().prepare("UPDATE runs SET status = 'failed' WHERE id = ? AND status = 'running'").run(runId)
}
export async function rateLimit(key, maximum = 15) {
  await transaction(async () => {
    const now = Date.now()
    await db().prepare('DELETE FROM attempts WHERE expires <= ?').run(now)
    await db().prepare('INSERT INTO attempts VALUES (?, 1, ?) ON DUPLICATE KEY UPDATE count = count + 1').run(key, now + 900000)
    const row = await db().prepare('SELECT count FROM attempts WHERE `key` = ?').get(key)
    if (row.count > maximum)
      throw new AppError(429, 'rateLimit')
  })
}
// An agent waits on its owner while a file write or API request awaits approval
export async function waitingOnOwner(id) {
  if (await db().prepare("SELECT 1 FROM approvals WHERE agent = ? AND status = 'pending' LIMIT 1").get(id))
    return true
  return !!await db().prepare("SELECT 1 FROM api_requests WHERE agent = ? AND status = 'pending' LIMIT 1").get(id)
}
