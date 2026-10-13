import { test } from 'node:test'
import assert from 'node:assert/strict'
import { audioType, musicTarget } from '../src/lib/zentra/music'
import { agentSchema } from '../src/lib/zentra/schema'
import { media } from '../src/config/media'
const base = { name: 'DJ', instructions: 'Play music.' }
test('plot music accepts only https links and IPFS uploads', () => {
  for (const musicUrl of ['', 'https://example.org/loop.mp3', 'ipfs://QmVLLYmeWSRK4kFLQtKvA53Ac3Zjfsy5UYfHt3J5FL6w6o', 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/track.ogg'])
    assert.equal(agentSchema.parse({ ...base, musicUrl }).musicUrl, musicUrl)
  for (const musicUrl of ['http://example.org/loop.mp3', 'javascript:alert(1)', 'ftp://example.org/a.mp3', 'ipfs://short', 'https://example.org/a b.mp3'])
    assert.throws(() => agentSchema.parse({ ...base, musicUrl }))
  assert.equal(agentSchema.parse(base).musicUrl, '')
})
test('IPFS music resolves through the configured gateway; unsafe targets are refused', () => {
  const ipfs = musicTarget('ipfs://QmVLLYmeWSRK4kFLQtKvA53Ac3Zjfsy5UYfHt3J5FL6w6o/song.mp3')
  assert.equal(ipfs.url.href, `${media.ipfsGateway}QmVLLYmeWSRK4kFLQtKvA53Ac3Zjfsy5UYfHt3J5FL6w6o/song.mp3`)
  assert.equal(ipfs.ipfs, true)
  for (const raw of ['https://127.0.0.1/a.mp3', 'https://user:pass@example.org/a.mp3', 'https://example.org:8443/a.mp3'])
    assert.throws(() => musicTarget(raw))
})
test('only audio responses are streamed', () => {
  assert.equal(audioType('audio/mpeg', '/a', false), 'audio/mpeg')
  assert.equal(audioType('audio/ogg; codecs=vorbis', '/a', false), 'audio/ogg')
  assert.equal(audioType('text/html', '/a.mp3', false), null)
  assert.equal(audioType('application/octet-stream', '/a', false), null, 'a generic type needs an audio extension off IPFS')
  assert.equal(audioType('application/octet-stream', '/a.m4a', false), 'audio/mp4')
  assert.equal(audioType('application/octet-stream', '/Qm123', true), 'audio/mpeg', 'IPFS uploads are often labelled generically')
})
