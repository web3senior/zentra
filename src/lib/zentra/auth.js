import { randomBytes, randomInt, randomUUID, scrypt as scryptCallback, createHash, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { db, AppError, rateLimit, transaction } from './store'
import { credentialsSchema, emailCodeSchema, emailSchema, publicNameSchema } from './schema'
import { sendSignInCode } from './mailer'
import { secretDigest } from './providerKeys'
import { upProfileOf } from './upProfiles'
const scrypt = promisify(scryptCallback)
export const cookieName = 'zentra_session'
const digest = (value) => createHash('sha256').update(value).digest('hex')
export async function ownerFromRequest(request) {
  const token = request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1)
  if (!token)
    throw new AppError(401, 'signIn')
  const row = await db().prepare('SELECT owner FROM sessions WHERE token = ? AND expires > ?').get(digest(token), Date.now())
  if (!row)
    throw new AppError(401, 'signIn')
  return row.owner
}
// Public name, whether it was chosen (accounts from before profiles count as named), and whether
// a linked wallet is a verified Universal Profile (with its public profile, when one was read)
export async function userInfo(owner) {
  const row = await db().prepare('SELECT u.username, COALESCE(p.named, 1) AS named, EXISTS (SELECT 1 FROM user_wallets w WHERE w.owner = u.id AND w.up = 1) AS up FROM users u LEFT JOIN profiles p ON p.owner = u.id WHERE u.id = ?').get(owner)
  return row && { username: row.username, named: !!row.named, up: !!row.up, profile: row.up ? await upProfileOf(owner) : null }
}
export async function setPublicName(owner, input) {
  const { name } = publicNameSchema.parse(input)
  try {
    await db().prepare('UPDATE users SET username = ? WHERE id = ?').run(name, owner)
  }
  catch {
    throw new AppError(409, 'usernameTaken')
  }
  await db().prepare('INSERT INTO profiles VALUES (?, 1) ON DUPLICATE KEY UPDATE named = 1').run(owner)
  return userInfo(owner)
}
// New accounts: closed in production unless ZENTRA_SIGNUP_TOKEN is set, and then by invite
export function assertSignup(invite) {
  if (process.env.NODE_ENV === 'production' && !process.env.ZENTRA_SIGNUP_TOKEN)
    throw new AppError(403, 'registrationClosed')
  if (process.env.ZENTRA_SIGNUP_TOKEN && digest(invite || '') !== digest(process.env.ZENTRA_SIGNUP_TOKEN))
    throw new AppError(403, 'invite')
}
export async function startSession(owner) {
  const token = randomBytes(32).toString('hex')
  await db().prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now())
  await db().prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(token), owner, Date.now() + 7 * 86400000)
  return token
}
export async function authenticate(input, register) {
  const { username, password, invite } = credentialsSchema.parse(input)
  await rateLimit(`login:${username}`)
  await rateLimit('auth:global', 100)
  if (register)
    assertSignup(invite)
  let user = await db().prepare('SELECT * FROM users WHERE username = ?').get(username)
  if (register) {
    if (user)
      throw new AppError(409, 'usernameTaken')
    const salt = randomBytes(16).toString('hex')
    const hash = await scrypt(password, salt, 64)
    const id = randomUUID()
    try {
      await db().prepare('INSERT INTO users VALUES (?, ?, ?)').run(id, username, `${salt}:${hash.toString('hex')}`)
    }
    catch {
      throw new AppError(409, 'usernameTaken')
    }
    user = { id, password: '' }
  }
  else {
    // Email-only accounts have no password and never sign in with one
    const [salt, stored] = (user?.password?.includes(':') ? user.password : `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':')
    const hash = await scrypt(password, salt, 64)
    if (!timingSafeEqual(hash, Buffer.from(stored, 'hex')) || !user?.password?.includes(':'))
      throw new AppError(401, 'credentials')
  }
  return startSession(user.id)
}
// Email sign-in, after hupsocial's: a 6-digit code, stored only as a keyed digest, expires in 10
// minutes and allows 5 tries. Requests are limited per address and overall.
const CODE_TTL = 600_000, CODE_TRIES = 5
const codeDigest = (email, code) => secretDigest('email-code', `${email}:${code}`)
export async function requestEmailCode(input) {
  const { email } = emailSchema.parse(input)
  await rateLimit(`email:${email}`, 5)
  await rateLimit('email:global', 100)
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
  await db().prepare('INSERT INTO email_codes VALUES (?, ?, ?, 0) ON DUPLICATE KEY UPDATE hash = VALUES(hash), expires = VALUES(expires), attempts = 0').run(email, codeDigest(email, code), Date.now() + CODE_TTL)
  await sendSignInCode(email, code)
}
// A first sign-in creates the account with a placeholder username (numbered when taken, since
// usernames are unique) until the person chooses their public name
export async function uniqueUsername(raw) {
  const base = (raw.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'user').slice(0, 28).padEnd(3, '0')
  for (let n = 1; n < 1000; n++) {
    const name = n === 1 ? base : `${base}-${n}`
    if (!await db().prepare('SELECT 1 FROM users WHERE username = ?').get(name))
      return name
  }
  return `user-${randomBytes(6).toString('hex')}`
}
export async function verifyEmailCode(input) {
  const { email, code, invite } = emailCodeSchema.parse(input)
  await rateLimit('auth:global', 100)
  // A try is spent before the comparison, so a failed request is never a free guess
  const spent = await db().prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE email = ? AND expires > ? AND attempts < ?').run(email, Date.now(), CODE_TRIES)
  if (!spent.changes)
    throw new AppError(400, 'codeExpired')
  const row = await db().prepare('SELECT hash FROM email_codes WHERE email = ?').get(email)
  if (!timingSafeEqual(Buffer.from(row.hash), Buffer.from(codeDigest(email, code))))
    throw new AppError(400, 'codeWrong')
  // One transaction, so two sign-ins racing on a new address make one account
  const owner = await transaction(async () => {
    const existing = (await db().prepare('SELECT owner FROM user_emails WHERE email = ?').get(email))?.owner
    if (existing)
      return existing
    // Checked before the code is used up, so an invite can follow without a new code
    assertSignup(invite)
    const id = randomUUID()
    await db().prepare('INSERT INTO users VALUES (?, ?, ?)').run(id, await uniqueUsername(email.split('@')[0]), '')
    await db().prepare('INSERT INTO profiles VALUES (?, 0)').run(id)
    await db().prepare('INSERT INTO user_emails VALUES (?, ?)').run(email, id)
    return id
  })
  await db().prepare('DELETE FROM email_codes WHERE email = ?').run(email)
  return startSession(owner)
}
export async function logout(request) {
  const token = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1)
  if (token)
    await db().prepare('DELETE FROM sessions WHERE token = ?').run(digest(token))
}
// The origins this site answers as: the configured ones (ZENTRA_APP_ORIGIN, NEXT_PUBLIC_BASE_URL,
// trailing slashes ignored) and the host the request actually arrived on, behind a proxy too
// (Vercel's x-forwarded-host). A page elsewhere never matches its own origin to this host.
export function siteOrigins(request) {
  const url = new URL(request.url)
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host
  const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')
  const configured = [process.env.ZENTRA_APP_ORIGIN, process.env.NEXT_PUBLIC_BASE_URL].flatMap((value) => { try {
    return value ? [new URL(value).origin] : []
  }
  catch {
    return []
  } })
  return new Set([...configured, `${proto}://${host}`, url.origin])
}
export function assertOrigin(request) {
  const origin = request.headers.get('origin')
  if (!origin || !siteOrigins(request).has(origin))
    throw new AppError(403, 'origin')
}
// A realtime ticket: the realtime process may run on another host than the site (the site on
// Vercel, realtime on a server), where the session cookie never reaches it. The page asks its own
// site for a ticket, signed with the shared encryption key and good for one minute, and hands it
// to the realtime process. owner.expires.signature; it signs in, nothing else.
const TICKET_MS = 60_000
export function realtimeTicket(owner) {
  const payload = `${owner}.${Date.now() + TICKET_MS}`
  return `${payload}.${secretDigest('realtime', payload)}`
}
export function ownerFromTicket(ticket) {
  const match = /^([\w-]{1,191})\.(\d{1,15})\.([0-9a-f]{64})$/.exec(String(ticket ?? ''))
  if (!match || Number(match[2]) < Date.now())
    return null
  const expected = Buffer.from(secretDigest('realtime', `${match[1]}.${match[2]}`), 'hex')
  const given = Buffer.from(match[3], 'hex')
  return expected.length === given.length && timingSafeEqual(expected, given) ? match[1] : null
}
