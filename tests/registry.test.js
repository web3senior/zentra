import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanRegistration } from '../src/lib/zentra/registry'
// Registration files are written by anyone; only safe, bounded fields may reach the colony
test('registration cleaning keeps safe bounded fields only', () => {
  const doc = cleanRegistration({
    name: `  Emmet\u0000${'x'.repeat(200)}`, description: 'd'.repeat(5000), active: 'true',
    services: [
      { name: 'web', endpoint: 'https://example.org/agent' },
      { name: 'evil', endpoint: 'javascript:alert(1)' },
      { type: 'A2A', url: 'http://example.org/.well-known/agent-card.json' },
      { name: 'broken', endpoint: 'not a url' },
      ...Array.from({ length: 20 }, (_, i) => ({ name: `s${i}`, endpoint: `https://example.org/${i}` })),
    ],
  })
  assert.ok(doc)
  assert.equal(doc.name.length, 60)
  assert.ok(!doc.name.includes('\u0000'))
  assert.equal(doc.description.length, 600)
  assert.equal(doc.active, false, 'only a real boolean true counts as active')
  assert.equal(doc.services.length, 8)
  assert.deepEqual(doc.services.slice(0, 2), [{ name: 'web', url: 'https://example.org/agent' }, { name: 'A2A', url: 'http://example.org/.well-known/agent-card.json' }])
  assert.ok(doc.services.every(s => /^https?:/.test(s.url)))
})
test('registration without a name is not shown', () => {
  assert.equal(cleanRegistration({ description: 'no name' }), null)
  assert.equal(cleanRegistration('just text'), null)
  assert.equal(cleanRegistration({ name: '   ' }), null)
})
