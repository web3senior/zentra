import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { heartbeat } from '../src/lib/zentra/queue'
import { workOnce } from '../src/lib/zentra/worker'
import { closeDatabase } from '../src/lib/zentra/database'
// Same environment and persistent directory as the web server. Never print credentials.
for (const file of ['.env.local', '.env'])
  if (existsSync(file))
    process.loadEnvFile(file)
const workerId = randomUUID()
const stop = new AbortController()
process.on('SIGINT', () => stop.abort())
process.on('SIGTERM', () => stop.abort())
async function main() {
  await heartbeat(workerId)
  const timer = setInterval(() => { heartbeat(workerId).catch(() => {}) }, 5000)
  console.log('Zentra worker started. Waiting for saved missions and events.')
  try {
    do {
      await workOnce(stop.signal)
      if (process.argv.includes('--once'))
        break
      await delay(3000, undefined, { signal: stop.signal })
    } while (!stop.signal.aborted)
  }
  catch {
    if (!stop.signal.aborted) {
      console.error('Worker stopped unexpectedly. Check server storage and configuration.')
      process.exitCode = 1
    }
  }
  finally {
    clearInterval(timer)
    // the MySQL pool would otherwise keep the process alive after --once or a stop signal
    await closeDatabase()
  }
}
void main()
