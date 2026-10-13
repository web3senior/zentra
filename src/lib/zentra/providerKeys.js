import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'
import { AppError, db } from './store'
// ZENTRA_ENCRYPTION_KEY: 64 hex characters (32 random bytes), from .env.local locally and the
// environment in production. Back it up with the database: without it stored secrets are unreadable.
function encryptionKey() {
  const configured = process.env.ZENTRA_ENCRYPTION_KEY
  if (!configured || !/^[a-fA-F0-9]{64}$/.test(configured))
    throw new AppError(503, 'encryptionSetup')
  return Buffer.from(configured, 'hex')
}
// A keyed digest for values that must be compared but never stored readable (email sign-in codes)
export function secretDigest(context, value) {
  return createHmac('sha256', encryptionKey()).update(`${context}:${value}`).digest('hex')
}
export async function providerStatus(owner) {
  return {
    openai: { ready: !!process.env.OPENAI_API_KEY },
    aimlapi: { ready: !!await db().prepare('SELECT owner FROM provider_keys WHERE owner = ?').get(owner) },
  }
}
export async function encryptSecret(context, value) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  cipher.setAAD(Buffer.from(context))
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64')).join('.')
}
export async function decryptSecret(context, encrypted) {
  const key = encryptionKey()
  try {
    const [iv, tag, ciphertext] = encrypted.split('.').map(part => Buffer.from(part, 'base64'))
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAAD(Buffer.from(context))
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  }
  catch {
    throw new AppError(503, 'encryptionSetup')
  }
}
export async function saveAimlKey(owner, apiKey) {
  const encrypted = await encryptSecret(`aimlapi:${owner}`, apiKey)
  await db().prepare('INSERT INTO provider_keys VALUES (?, ?) ON DUPLICATE KEY UPDATE encrypted = VALUES(encrypted)').run(owner, encrypted)
}
export async function readAimlKey(owner) {
  const row = await db().prepare('SELECT encrypted FROM provider_keys WHERE owner = ?').get(owner)
  return row ? decryptSecret(`aimlapi:${owner}`, row.encrypted) : undefined
}
export async function removeAimlKey(owner) {
  await db().prepare('DELETE FROM provider_keys WHERE owner = ?').run(owner)
}
