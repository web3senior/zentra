import { AppError } from './store'
import { claimJob, recoverJobs, settleJob, tickSchedules } from './queue'
import { talk } from './runtime'
export async function workOnce(signal, execute = talk) {
  await recoverJobs()
  await tickSchedules()
  if (signal.aborted)
    return false
  const job = await claimJob()
  if (!job)
    return false
  try {
    const result = await execute(job.owner, job.agent, job.run, job.prompt, signal, undefined, job.id)
    await settleJob(job, result.messages.at(-1)?.content || '')
  }
  catch (error) {
    await settleJob(job, null, error instanceof AppError ? error.code : 'workerError')
  }
  return true
}
