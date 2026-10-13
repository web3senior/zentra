import { createHash, randomUUID } from 'node:crypto'
import { fileSchema } from './operationsSchema'
import { activity, AppError, assertRun, busy, db, getAgent, transaction } from './store'
const hash = (text) => createHash('sha256').update(text).digest('hex')
export async function listFiles(owner, id) {
  await getAgent(owner, id)
  return await db().prepare('SELECT name, content, updated FROM files WHERE agent = ? ORDER BY name').all(id)
}
async function putFile(id, name, content) {
  const existing = await db().prepare('SELECT name FROM files WHERE agent = ? AND name = ?').get(id, name)
  const count = await db().prepare('SELECT COUNT(*) AS n FROM files WHERE agent = ?').get(id)
  if (!existing && count.n >= 30)
    throw new AppError(409, 'fileLimit')
  await db().prepare('INSERT INTO files VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content), updated = VALUES(updated)').run(id, name, content, Date.now())
}
export async function ownerFile(owner, id, input) {
  const { name, content } = fileSchema.parse(input)
  await transaction(async () => {
    await getAgent(owner, id)
    if (await busy(id))
      throw new AppError(409, 'busy')
    await putFile(id, name, content)
    await activity(id, 'file_saved', name)
  })
}
export async function deleteFile(owner, id, name) {
  await transaction(async () => {
    await getAgent(owner, id)
    if (await busy(id))
      throw new AppError(409, 'busy')
    await db().prepare('DELETE FROM files WHERE agent = ? AND name = ?').run(id, name)
    await activity(id, 'file_deleted', name)
  })
}
export async function agentFile(owner, id, run, input) {
  const { name, content } = fileSchema.parse(input)
  return await transaction(async () => {
    await assertRun(owner, id, run)
    const { agent } = await getAgent(owner, id)
    if (!agent.filesEnabled || agent.fileWriteMode === 'deny')
      throw new AppError(403, 'permission')
    if (agent.fileWriteMode === 'allow') {
      await putFile(id, name, content)
      await activity(id, 'file_saved', name, run)
      return { status: 'saved', name }
    }
    const count = await db().prepare("SELECT COUNT(*) AS n FROM approvals WHERE agent = ? AND status = 'pending'").get(id)
    if (count.n >= 20)
      throw new AppError(409, 'approvalLimit')
    const prior = await db().prepare('SELECT content FROM files WHERE agent = ? AND name = ?').get(id, name)
    const request = randomUUID()
    await db().prepare("INSERT INTO approvals VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)").run(request, id, run, name, content, hash(prior ? `exists:${prior.content}` : 'absent'), Date.now())
    await activity(id, 'approval_requested', name, run)
    return { status: 'awaiting_owner_approval', id: request, name }
  })
}
export async function decideApproval(owner, id, requestId, approve) {
  await transaction(async () => {
    const { agent } = await getAgent(owner, id)
    if (await busy(id))
      throw new AppError(409, 'busy')
    const row = await db().prepare('SELECT * FROM approvals WHERE id = ? AND agent = ?').get(requestId, id)
    if (!row)
      throw new AppError(404, 'notFound')
    if (row.status !== 'pending')
      throw new AppError(409, 'approvalResolved')
    if (approve) {
      if (agent.paused || !agent.filesEnabled || agent.fileWriteMode === 'deny')
        throw new AppError(403, 'permission')
      if (row.created < Date.now() - 7 * 86400000)
        throw new AppError(409, 'approvalExpired')
      const prior = await db().prepare('SELECT content FROM files WHERE agent = ? AND name = ?').get(id, row.name)
      if (hash(prior ? `exists:${prior.content}` : 'absent') !== row.priorHash)
        throw new AppError(409, 'fileConflict')
      await putFile(id, row.name, row.content)
    }
    await db().prepare('UPDATE approvals SET status = ? WHERE id = ?').run(approve ? 'approved' : 'rejected', requestId)
    await activity(id, approve ? 'approval_approved' : 'approval_rejected', row.name)
  })
}
