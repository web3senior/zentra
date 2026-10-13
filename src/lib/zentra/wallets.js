import { randomBytes, randomUUID } from 'node:crypto'
import { createPublicClient, getAddress, http, isAddress, parseAbi } from 'viem'
import { parseSiweMessage, verifySiweMessage } from 'viem/siwe'
import { z } from 'zod'
import { signInChains, signInMessage, universalProfile } from '@/config/wallets'
import { AppError, db, rateLimit, transaction } from './store'
import { assertSignup, ownerFromRequest, startSession, uniqueUsername } from './auth'
import { readUpProfile, saveUpProfile } from './upProfiles'
// Wallet sign-in (EIP-4361, after hupsocial's): the server hands out a one-time nonce, the wallet
// signs a message naming this site, the nonce, the chain and an expiry, and the server checks it.
// viem verifies ordinary wallets and smart accounts (ERC-1271) alike, so a Universal Profile signs
// through its own contract. The signature signs in and approves nothing else.
const lsp0 = parseAbi(['function supportsInterface(bytes4 interfaceId) view returns (bool)'])
const clients = new Map()
function clientFor(chainId) {
  const chain = signInChains.find((c) => c.id === chainId)
  if (!chain)
    throw new AppError(400, 'walletChain')
  if (!clients.has(chainId))
    clients.set(chainId, createPublicClient({ chain: { id: chain.id, name: chain.name, nativeCurrency: { name: 'native', symbol: 'N', decimals: 18 }, rpcUrls: { default: { http: [chain.rpc] } } }, transport: http(chain.rpc, { timeout: 15000 }) }))
  return clients.get(chainId)
}
const addressSchema = z.object({ address: z.string().refine((value) => isAddress(value, { strict: false })) })
const verifySchema = z.object({ message: z.string().min(1).max(2000), signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(20000), invite: z.string().max(256).optional() })
export async function walletNonce(input) {
  const address = getAddress(addressSchema.parse(input).address)
  await rateLimit(`wallet:${address.toLowerCase()}`, 10)
  await rateLimit('wallet:global', 200)
  const nonce = randomBytes(16).toString('hex')
  await db().prepare('DELETE FROM wallet_nonces WHERE expires <= ?').run(Date.now())
  await db().prepare('INSERT INTO wallet_nonces VALUES (?, ?, ?)').run(nonce, address.toLowerCase(), Date.now() + signInMessage.minutes * 60_000)
  return { nonce, statement: signInMessage.statement, minutes: signInMessage.minutes, chains: signInChains.map((c) => c.id) }
}
// A Universal Profile answers LSP0's interface on LUKSO; any failure means "not a profile"
export async function isUniversalProfile(address) {
  try {
    return await clientFor(universalProfile.chainId).readContract({ address, abi: lsp0, functionName: 'supportsInterface', args: [universalProfile.interfaceId] })
  }
  catch {
    return false
  }
}
// The domain a message must name: the site's own host
const hostOf = (request) => new URL(process.env.ZENTRA_APP_ORIGIN || request.url).host
async function checkSignature(request, input) {
  const { message, signature, invite } = verifySchema.parse(input)
  let fields
  try {
    fields = parseSiweMessage(message)
  }
  catch {
    throw new AppError(400, 'walletSignature')
  }
  if (!fields.address || !fields.nonce || !fields.chainId || fields.domain !== hostOf(request))
    throw new AppError(400, 'walletSignature')
  const address = getAddress(fields.address)
  // The nonce works once, for this address, until it expires
  const used = await db().prepare('DELETE FROM wallet_nonces WHERE nonce = ? AND address = ? AND expires > ?').run(fields.nonce, address.toLowerCase(), Date.now())
  if (!used.changes)
    throw new AppError(400, 'walletNonce')
  let valid = false
  try {
    valid = await verifySiweMessage(clientFor(fields.chainId), { message, signature, domain: hostOf(request), nonce: fields.nonce })
  }
  catch (error) {
    if (error instanceof AppError)
      throw error
  }
  if (!valid)
    throw new AppError(401, 'walletSignature')
  return { address, invite }
}
// Names made from an address before profiles were read (up-6f77d2, wallet-1a2b3c): replaced by a
// Universal Profile's own name when one is found
const addressName = /^(up|wallet)-[0-9a-f]{6}(-\d+)?$/
// A Universal Profile's profile, read from LUKSO and stored; null when it has none or LUKSO is
// unreachable (signing in goes ahead either way)
async function upProfileFor(address) {
  const profile = await readUpProfile(clientFor(universalProfile.chainId), address)
  if (profile)
    await saveUpProfile(address, profile)
  return profile
}
// Gives an account its Universal Profile's name while it has no name of its own
async function adoptUpName(owner, profile) {
  if (!profile?.name)
    return
  const row = await db().prepare('SELECT u.username, COALESCE(p.named, 1) AS named FROM users u LEFT JOIN profiles p ON p.owner = u.id WHERE u.id = ?').get(owner)
  if (!row || (row.named && !addressName.test(row.username)))
    return
  await db().prepare('UPDATE users SET username = ? WHERE id = ?').run(await uniqueUsername(profile.name), owner)
  await db().prepare('INSERT INTO profiles VALUES (?, 1) ON DUPLICATE KEY UPDATE named = 1').run(owner)
}
async function adoptUpProfile(owner, address) {
  const profile = await upProfileFor(address)
  await transaction(() => adoptUpName(owner, profile))
}
// Signs in with a wallet: its account, or a new one. A Universal Profile brings its name, picture
// and bio; any other new account chooses its public name next
export async function walletSignIn(request, input) {
  await rateLimit('auth:global', 100)
  const { address, invite } = await checkSignature(request, input)
  const key = address.toLowerCase()
  const up = await isUniversalProfile(address)
  const owner = await transaction(async () => {
    const existing = await db().prepare('SELECT owner FROM user_wallets WHERE address = ?').get(key)
    if (existing) {
      await db().prepare('UPDATE user_wallets SET up = ? WHERE address = ?').run(up ? 1 : 0, key)
      return existing.owner
    }
    assertSignup(invite)
    const id = randomUUID()
    // A placeholder until a name is chosen or adopted; unnamed accounts are never shown
    await db().prepare('INSERT INTO users VALUES (?, ?, ?)').run(id, await uniqueUsername(`wallet-${key.slice(2, 8)}`), '')
    await db().prepare('INSERT INTO profiles VALUES (?, 0)').run(id)
    await db().prepare('INSERT INTO user_wallets VALUES (?, ?, ?, ?)').run(key, id, up ? 1 : 0, Date.now())
    return id
  })
  if (up)
    await adoptUpProfile(owner, address)
  return startSession(owner)
}
// Links one more wallet to the signed-in account
export async function linkWallet(request, input) {
  const owner = await ownerFromRequest(request)
  const { address } = await checkSignature(request, input)
  const key = address.toLowerCase()
  const up = await isUniversalProfile(address)
  await transaction(async () => {
    const existing = await db().prepare('SELECT owner FROM user_wallets WHERE address = ?').get(key)
    if (existing && existing.owner !== owner)
      throw new AppError(409, 'walletTaken')
    await db().prepare('INSERT INTO user_wallets VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE up = VALUES(up)').run(key, owner, up ? 1 : 0, Date.now())
  })
  if (up)
    await adoptUpProfile(owner, address)
  return { address, up }
}
// Reads every linked Universal Profile again (pnpm up-profiles): picture, bio and links, and the
// profile's name for accounts still named after their address
export async function refreshUpProfiles() {
  const rows = await db().prepare('SELECT address, owner FROM user_wallets WHERE up = 1').all()
  for (const row of rows)
    await adoptUpProfile(row.owner, getAddress(row.address))
  return rows.length
}
