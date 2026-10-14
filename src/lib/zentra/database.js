import { AsyncLocalStorage } from 'node:async_hooks'
import mysql from 'mysql2/promise'
// MySQL storage. ZENTRA_DATABASE_URL names the server and database (created if missing)
// locally it defaults to XAMPP's MySQL. Production must configure it explicitly.
// Timestamps are milliseconds (BIGINT); ids are UUIDs or digests (VARCHAR).
const LOCAL = 'mysql://root@127.0.0.1:3306/zentra'
export function databaseUrl() {
  const configured = process.env.ZENTRA_DATABASE_URL
  if (!configured && process.env.NODE_ENV === 'production')
    throw new Error('ZENTRA_DATABASE_URL is required in production')
  return configured || LOCAL
}
const id = 'VARCHAR(191) NOT NULL'
const ms = 'BIGINT NOT NULL'
const text = 'MEDIUMTEXT NOT NULL'
const ownedBy = (table) => `FOREIGN KEY (agent) REFERENCES ${table}(id) ON DELETE CASCADE`
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id ${id} PRIMARY KEY, username VARCHAR(64) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL)`,
  // Email sign-in: the account an address belongs to, and the pending one-time code (hashed)
  `CREATE TABLE IF NOT EXISTS user_emails (email VARCHAR(254) NOT NULL PRIMARY KEY, owner ${id} UNIQUE, FOREIGN KEY (owner) REFERENCES users(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS email_codes (email VARCHAR(254) NOT NULL PRIMARY KEY, hash CHAR(64) NOT NULL, expires ${ms}, attempts INT NOT NULL DEFAULT 0)`,
  // Public profile: named is 0 until the person picks their public name (accounts from before this
  // table have no row and count as named). Wallets that sign in, and one-time sign-in nonces
  `CREATE TABLE IF NOT EXISTS profiles (owner ${id} PRIMARY KEY, named TINYINT NOT NULL DEFAULT 0, FOREIGN KEY (owner) REFERENCES users(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS user_wallets (address CHAR(42) NOT NULL PRIMARY KEY, owner ${id}, up TINYINT NOT NULL DEFAULT 0, linked ${ms}, INDEX wallet_owner (owner), FOREIGN KEY (owner) REFERENCES users(id) ON DELETE CASCADE)`,
  // A Universal Profile's public LSP3 profile, read from LUKSO at sign-in: display name, picture
  // and background (https URLs), bio and links (JSON). Untrusted text, capped when read
  `CREATE TABLE IF NOT EXISTS up_profiles (address CHAR(42) NOT NULL PRIMARY KEY, name VARCHAR(191) NOT NULL DEFAULT '', avatar VARCHAR(600) NOT NULL DEFAULT '', background VARCHAR(600) NOT NULL DEFAULT '', description TEXT NOT NULL, links TEXT NOT NULL, updated ${ms}, FOREIGN KEY (address) REFERENCES user_wallets(address) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS wallet_nonces (nonce VARCHAR(64) NOT NULL PRIMARY KEY, address CHAR(42) NOT NULL, expires ${ms})`,
  `CREATE TABLE IF NOT EXISTS sessions (token ${id} PRIMARY KEY, owner ${id}, expires ${ms}, FOREIGN KEY (owner) REFERENCES users(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS agents (id ${id} PRIMARY KEY, owner ${id}, config ${text}, created ${ms}, memory ${text}, INDEX agent_owner (owner), FOREIGN KEY (owner) REFERENCES users(id) ON DELETE CASCADE)`,
  // seq keeps insertion order for messages written in the same millisecond
  `CREATE TABLE IF NOT EXISTS messages (id ${id} PRIMARY KEY, agent ${id}, role VARCHAR(16) NOT NULL, content ${text}, created ${ms}, seq BIGINT NOT NULL AUTO_INCREMENT UNIQUE, INDEX message_agent (agent, created), ${ownedBy('agents')})`,
  `CREATE TABLE IF NOT EXISTS runs (id ${id} PRIMARY KEY, agent ${id}, day CHAR(10) NOT NULL, status VARCHAR(16) NOT NULL, expires ${ms}, tokens INT NOT NULL DEFAULT 0, INDEX run_agent (agent, day), ${ownedBy('agents')})`,
  `CREATE TABLE IF NOT EXISTS attempts (\`key\` ${id} PRIMARY KEY, count INT NOT NULL, expires ${ms})`,
  `CREATE TABLE IF NOT EXISTS provider_keys (owner ${id} PRIMARY KEY, encrypted TEXT NOT NULL, FOREIGN KEY (owner) REFERENCES users(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS files (agent ${id}, name VARCHAR(100) NOT NULL, content ${text}, updated ${ms}, PRIMARY KEY (agent, name), ${ownedBy('agents')})`,
  `CREATE TABLE IF NOT EXISTS connections (agent ${id} PRIMARY KEY, encrypted TEXT NOT NULL, ${ownedBy('agents')})`,
  `CREATE TABLE IF NOT EXISTS activity (id ${id} PRIMARY KEY, agent ${id}, run VARCHAR(191), kind VARCHAR(40) NOT NULL, detail TEXT NOT NULL, created ${ms}, seq BIGINT NOT NULL AUTO_INCREMENT UNIQUE, INDEX activity_agent (agent, created), INDEX activity_run (run), ${ownedBy('agents')})`,
  `CREATE TABLE IF NOT EXISTS approvals (id ${id} PRIMARY KEY, agent ${id}, run VARCHAR(191) NOT NULL, name VARCHAR(100) NOT NULL, content ${text}, priorHash VARCHAR(128) NOT NULL, status VARCHAR(16) NOT NULL, created ${ms}, ${ownedBy('agents')})`,
  `CREATE TABLE IF NOT EXISTS missions (agent ${id} PRIMARY KEY, config ${text}, next ${ms}, eventHash VARCHAR(128), ${ownedBy('agents')})`,
  `CREATE TABLE IF NOT EXISTS jobs (id ${id} PRIMARY KEY, agent ${id}, source VARCHAR(16) NOT NULL, event VARCHAR(191) NOT NULL, prompt ${text}, status VARCHAR(16) NOT NULL, due ${ms}, lease BIGINT NOT NULL DEFAULT 0, attempts INT NOT NULL DEFAULT 0, retries INT NOT NULL, run VARCHAR(191), result MEDIUMTEXT, error TEXT, created ${ms}, UNIQUE KEY job_event (agent, source, event), INDEX job_due (status, due), ${ownedBy('agents')})`,
  `CREATE TABLE IF NOT EXISTS workers (id ${id} PRIMARY KEY, seen ${ms})`,
  `CREATE TABLE IF NOT EXISTS run_results (run ${id} PRIMARY KEY, content ${text}, FOREIGN KEY (run) REFERENCES runs(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS api_connections (id ${id} PRIMARY KEY, agent ${id}, config ${text}, encrypted TEXT, ${ownedBy('agents')})`,
  `CREATE TABLE IF NOT EXISTS api_requests (id ${id} PRIMARY KEY, agent ${id}, connection VARCHAR(191) NOT NULL, name VARCHAR(200) NOT NULL, url TEXT NOT NULL, method VARCHAR(10) NOT NULL, body ${text}, status VARCHAR(16) NOT NULL, result MEDIUMTEXT, created ${ms}, INDEX api_request_agent (agent, status), ${ownedBy('agents')})`,
  // Uploaded plot music: details, then the audio in 256 KB pieces (MySQL's default packet limit is 1 MB)
  `CREATE TABLE IF NOT EXISTS music (agent ${id} PRIMARY KEY, name VARCHAR(200) NOT NULL, type VARCHAR(40) NOT NULL, size INT NOT NULL, pieces INT NOT NULL, updated ${ms}, ${ownedBy('agents')})`,
  `CREATE TABLE IF NOT EXISTS music_pieces (agent ${id}, idx INT NOT NULL, data MEDIUMBLOB NOT NULL, PRIMARY KEY (agent, idx), ${ownedBy('agents')})`,
  // People's chat (docs/plans/people-presence-chat.md): area rooms (area:<id>) and 1:1 rooms
  // (dm:<idA>:<idB>, ids sorted). Positions are never stored. Times are ms; deleted lines keep a stub.
  `CREATE TABLE IF NOT EXISTS chat_messages (id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, room VARCHAR(100) NOT NULL, sender ${id}, body VARCHAR(1000) NOT NULL, reply_to BIGINT, created ${ms}, edited BIGINT, deleted BIGINT, deleted_by VARCHAR(191), INDEX chat_room (room, id), FOREIGN KEY (sender) REFERENCES users(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS chat_reactions (message BIGINT NOT NULL, user ${id}, emoji VARCHAR(16) NOT NULL, PRIMARY KEY (message, user, emoji), FOREIGN KEY (message) REFERENCES chat_messages(id) ON DELETE CASCADE, FOREIGN KEY (user) REFERENCES users(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS chat_reads (user ${id}, room VARCHAR(100) NOT NULL, last_id BIGINT NOT NULL, PRIMARY KEY (user, room), FOREIGN KEY (user) REFERENCES users(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS chat_blocks (user ${id}, blocked ${id}, created ${ms}, PRIMARY KEY (user, blocked), FOREIGN KEY (user) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (blocked) REFERENCES users(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS chat_reports (id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, message BIGINT NOT NULL, reporter ${id}, reason VARCHAR(500) NOT NULL, created ${ms}, FOREIGN KEY (message) REFERENCES chat_messages(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS chat_mutes (user ${id} PRIMARY KEY, until ${ms}, by_user VARCHAR(191) NOT NULL, FOREIGN KEY (user) REFERENCES users(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS chain_agents (chain VARCHAR(32) NOT NULL, agent_id BIGINT NOT NULL, owner VARCHAR(64) NOT NULL, uri TEXT NOT NULL, doc MEDIUMTEXT, feedback INT NOT NULL DEFAULT 0, last_feedback BIGINT, synced ${ms}, PRIMARY KEY (chain, agent_id))`,
  `CREATE TABLE IF NOT EXISTS chain_sync (chain VARCHAR(32) NOT NULL PRIMARY KEY, synced ${ms}, error TEXT)`,
  // Hup Tasks bounties per chain (read-only job board); amounts are base units as decimal strings
  `CREATE TABLE IF NOT EXISTS chain_jobs (chain VARCHAR(32) NOT NULL, post_id BIGINT NOT NULL, poster VARCHAR(64) NOT NULL, token VARCHAR(64) NOT NULL, reward VARCHAR(80) NOT NULL, slots INT NOT NULL, paid INT NOT NULL, deadline BIGINT NOT NULL, category VARCHAR(64) NOT NULL, sealed TINYINT NOT NULL, closed VARCHAR(16) NOT NULL, hidden TINYINT NOT NULL, brief TEXT, block BIGINT NOT NULL, PRIMARY KEY (chain, post_id))`,
  `CREATE TABLE IF NOT EXISTS chain_job_payouts (chain VARCHAR(32) NOT NULL, post_id BIGINT NOT NULL, reply_id BIGINT NOT NULL, worker VARCHAR(64) NOT NULL, amount VARCHAR(80) NOT NULL, agent_id BIGINT NOT NULL, rating INT NOT NULL, PRIMARY KEY (chain, post_id, reply_id))`,
  `CREATE TABLE IF NOT EXISTS chain_tokens (chain VARCHAR(32) NOT NULL, address VARCHAR(64) NOT NULL, symbol VARCHAR(32), decimals INT, PRIMARY KEY (chain, address))`,
].map(sql => `${sql} ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
let pool
let ready
const transactionConnection = new AsyncLocalStorage()
async function open() {
  const url = new URL(databaseUrl())
  const name = decodeURIComponent(url.pathname.slice(1))
  if (!/^[A-Za-z0-9_]+$/.test(name))
    throw new Error('Invalid database name')
  // ?ssl=true encrypts the connection (a database reached over the internet, e.g. from Vercel).
  // As hupsocial does, the server's certificate is not verified: MariaDB 11.8 makes its own.
  const ssl = url.searchParams.get('ssl') === 'true' ? { rejectUnauthorized: false } : undefined
  const options = { host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), charset: 'utf8mb4', supportBigNumbers: true, decimalNumbers: true, ssl }
  const setup = await mysql.createConnection(options)
  try {
    await setup.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  }
  finally {
    await setup.end()
  }
  // In production every serverless instance has its own pool: a few connections, idle ones
  // handed back, so many instances never exhaust the server's max_connections (shared with Hup)
  const production = process.env.NODE_ENV === 'production'
  pool = mysql.createPool({ ...options, database: name, connectionLimit: production ? 3 : 10, maxIdle: production ? 1 : 10, idleTimeout: 30000, enableKeepAlive: true })
  for (const statement of SCHEMA)
    await pool.query(statement)
}
async function connection() {
  ready ??= open().catch(error => { ready = undefined; throw error; })
  await ready
  return transactionConnection.getStore() ?? pool
}
async function query(sql, params) {
  const [result] = await (await connection()).query(sql, params)
  return result
}
// The previous store's shape, now asynchronous: db().prepare(sql).get / all / run
export function db() {
  return {
    prepare: (sql) => ({
      get: async (...params) => (await query(sql, params))[0],
      all: async (...params) => await query(sql, params),
      run: async (...params) => ({ changes: (await query(sql, params)).affectedRows }),
    }),
  }
}
// Transactions run on one connection and hold a global lock, so they serialize as the SQLite
// store's BEGIN IMMEDIATE did: checks such as "one run at a time" stay atomic. Nested calls join.
export async function transaction(work) {
  if (transactionConnection.getStore())
    return work()
  await connection()
  const conn = await pool.getConnection()
  try {
    const [[lock]] = await conn.query('SELECT GET_LOCK(?, 10) AS held', ['zentra'])
    if (lock.held !== 1)
      throw new Error('Database busy')
    try {
      await conn.beginTransaction()
      const result = await transactionConnection.run(conn, work)
      await conn.commit()
      return result
    }
    catch (error) {
      await conn.rollback()
      throw error
    }
    finally {
      await conn.query('SELECT RELEASE_LOCK(?)', ['zentra'])
    }
  }
  finally {
    conn.release()
  }
}
export async function closeDatabase() {
  const current = pool
  pool = undefined
  ready = undefined
  await current?.end()
}
