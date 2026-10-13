import { existsSync } from 'node:fs'
import { refreshUpProfiles } from '../src/lib/zentra/wallets'
import { closeDatabase } from '../src/lib/zentra/database'
// Refreshes stored Universal Profiles from LUKSO. Same environment as the web server.
for (const file of ['.env.local', '.env'])
  if (existsSync(file))
    process.loadEnvFile(file)
async function main() {
  try {
    console.log(`Refreshed ${await refreshUpProfiles()} Universal Profiles`)
  }
  finally {
    await closeDatabase()
  }
}
main()
