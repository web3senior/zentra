import { hexToString, parseAbi } from 'viem'
import { universalProfile } from '@/config/wallets'
import { registration, text } from './registry'
import { db } from './store'
// Universal Profiles (after hupsocial's lib/lukso.js): the profile lives in the account's own
// ERC725Y storage under the LSP3Profile key, a VerifiableURI naming a JSON document. Read at
// sign-in and stored, so the colony never waits on LUKSO or IPFS. Everything in it is untrusted.
const erc725y = parseAbi(['function getData(bytes32 dataKey) view returns (bytes)'])
// A VerifiableURI is 0x0000 + method + hash length + hash + url: the url is the trailing text
function verifiableUri(bytes) {
  if (!bytes || bytes === '0x')
    return null
  try {
    return hexToString(bytes).match(/(ipfs:\/\/|https:\/\/|data:)[^\u0000-\u001f\u007f]*$/)?.[0] ?? null
  }
  catch {
    return null
  }
}
// An https URL the browser can load: ipfs:// through LUKSO's gateway, anything else dropped
function httpsUrl(raw) {
  const value = text(raw, 500)
  if (value.startsWith('ipfs://'))
    return universalProfile.ipfsGateway + value.slice(7).replace(/^ipfs\//, '')
  try {
    return new URL(value).protocol === 'https:' ? value : ''
  }
  catch {
    return ''
  }
}
// LSP3 image lists hold one entry per resolution: the smallest at least `min` px wide, else the largest
function pickImage(field, min) {
  const list = (Array.isArray(field) ? field.flat() : field ? [field] : [])
    .map((entry) => typeof entry === 'string' ? { url: entry, width: 0 } : entry)
    .filter((entry) => entry && typeof entry.url === 'string')
    .sort((a, b) => (Number(a.width) || 0) - (Number(b.width) || 0))
  const chosen = list.find((entry) => Number(entry.width) >= min) ?? list.at(-1)
  return chosen ? httpsUrl(chosen.url) : ''
}
function cleanProfile(doc) {
  if (!doc || typeof doc !== 'object')
    return null
  const links = (Array.isArray(doc.links) ? doc.links : []).flatMap((link) => {
    const url = text(link?.url, 300)
    try {
      if (!['https:', 'http:'].includes(new URL(url).protocol))
        return []
    }
    catch {
      return []
    }
    return [{ title: text(link.title, 40) || new URL(url).hostname, url }]
  }).slice(0, 6)
  return { name: text(doc.name, 60), description: text(doc.description, 600), avatar: pickImage(doc.profileImage, 128), background: pickImage(doc.backgroundImage, 600), links }
}
// The profile a Universal Profile publishes, or null when it publishes none or cannot be read now
export async function readUpProfile(client, address) {
  try {
    const uri = verifiableUri(await client.readContract({ address, abi: erc725y, functionName: 'getData', args: [universalProfile.lsp3Key] }))
    if (!uri)
      return null
    const json = await registration({ ipfsGateway: universalProfile.ipfsGateway }, uri)
    return cleanProfile(json?.LSP3Profile)
  }
  catch {
    return null
  }
}
export async function saveUpProfile(address, profile) {
  await db().prepare('INSERT INTO up_profiles VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), avatar = VALUES(avatar), background = VALUES(background), description = VALUES(description), links = VALUES(links), updated = VALUES(updated)')
    .run(address.toLowerCase(), profile.name, profile.avatar, profile.background, profile.description, JSON.stringify(profile.links), Date.now())
}
// An account's Universal Profile (its most recently linked one that has a stored profile)
export async function upProfileOf(owner) {
  const row = await db().prepare('SELECT p.address, p.name, p.avatar, p.background, p.description, p.links FROM up_profiles p JOIN user_wallets w ON w.address = p.address WHERE w.owner = ? AND w.up = 1 ORDER BY w.linked DESC LIMIT 1').get(owner)
  if (!row)
    return null
  let links = []
  try {
    links = JSON.parse(row.links)
  }
  catch { }
  return { address: row.address, name: row.name, avatar: row.avatar, background: row.background, description: row.description, links, url: universalProfile.profileUrl + row.address }
}
