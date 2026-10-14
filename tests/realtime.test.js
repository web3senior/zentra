import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { ownerFromTicket, realtimeTicket } from '../src/lib/zentra/auth'
// The key is read when a ticket is signed, so setting it after the import is enough
process.env.ZENTRA_ENCRYPTION_KEY = randomBytes(32).toString('hex')

const owner = '6f1c2d3e-0000-4000-8000-123456789abc'

test('a fresh realtime ticket names its owner', () => {
  assert.equal(ownerFromTicket(realtimeTicket(owner)), owner)
})

test('an expired, altered or foreign ticket names no one', () => {
  const [id, expires, signature] = realtimeTicket(owner).split('.')
  assert.equal(ownerFromTicket(`${id}.${Date.now() - 1}.${signature}`), null)
  assert.equal(ownerFromTicket(`other-user.${expires}.${signature}`), null)
  assert.equal(ownerFromTicket(`${id}.${expires}.${'0'.repeat(64)}`), null)
  assert.equal(ownerFromTicket(''), null)
  assert.equal(ownerFromTicket(null), null)
})
