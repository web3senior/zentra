import { resolve4 } from 'node:dns/promises'
import { request } from 'node:https'
import { isIP } from 'node:net'
import { decryptSecret, encryptSecret } from './providerKeys'
import { activity, AppError, assertRun, db, getAgent } from './store'
export async function saveGithubKey(owner, id, token) {
  await getAgent(owner, id)
  if (token)
    await db().prepare('INSERT INTO connections VALUES (?, ?) ON DUPLICATE KEY UPDATE encrypted = VALUES(encrypted)').run(id, await encryptSecret(`github:${owner}:${id}`, token))
  else
    await db().prepare('DELETE FROM connections WHERE agent = ?').run(id)
  await activity(id, 'github_key_changed', token ? 'configured' : 'removed')
}
export function publicAddress(ip) {
  if (isIP(ip) !== 4)
    return false
  const [a, b, c] = ip.split('.').map(Number)
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113))
}
export function allowedWebUrl(raw, hosts) {
  let url
  try {
    url = new URL(raw)
  }
  catch {
    throw new AppError(400, 'invalid')
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || isIP(url.hostname) || !hosts.includes(url.hostname))
    throw new AppError(403, 'permission')
  return url
}
// Resolve before connecting and pin the public address to prevent DNS rebinding. No redirects,
// cookies or provider credentials. Owners explicitly authorize each exact website hostname.
export async function readWebsite(owner, id, run, raw, signal) {
  await assertRun(owner, id, run)
  const url = allowedWebUrl(raw, (await getAgent(owner, id)).agent.webHosts)
  const addresses = await resolve4(url.hostname)
  if (!addresses.length || addresses.some(ip => !publicAddress(ip)))
    throw new AppError(403, 'permission')
  await assertRun(owner, id, run)
  const text = await new Promise((resolve, reject) => {
    const req = request(url, {
      method: 'GET', family: 4, signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      lookup: (_host, _options, callback) => callback(null, addresses[0], 4),
      headers: { 'User-Agent': 'Zentra/1.0', Accept: 'text/html, text/plain, application/json', 'Accept-Encoding': 'identity' },
    }, response => {
      if (response.statusCode !== 200 || !/^(text\/(html|plain|markdown)|application\/(json|xml))/.test(String(response.headers['content-type']))) {
        response.destroy()
        reject(new AppError(502, 'webRead'))
        return
      }
      const chunks = []
      let length = 0
      response.on('data', (chunk) => {
        length += chunk.length
        if (length > 512000) {
          response.destroy()
          reject(new AppError(413, 'webRead'))
          return
        }
        chunks.push(chunk)
      })
      response.on('error', reject)
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })
    req.on('error', reject)
    req.end()
  })
  await assertRun(owner, id, run)
  await activity(id, 'web_read', url.hostname, run)
  return { url: url.href, text: text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 12000), untrusted: true }
}
export async function readGithub(owner, id, run, repository, path, signal) {
  await assertRun(owner, id, run)
  if (!(await getAgent(owner, id)).agent.githubRepos.includes(repository.toLowerCase()))
    throw new AppError(403, 'permission')
  if (path.split('/').some(part => part === '..' || part === '.') || path.length > 300)
    throw new AppError(400, 'invalid')
  const record = await db().prepare('SELECT encrypted FROM connections WHERE agent = ?').get(id)
  const token = record ? await decryptSecret(`github:${owner}:${id}`, record.encrypted) : undefined
  const suffix = path.split('/').map(encodeURIComponent).join('/')
  const url = `https://api.github.com/repos/${repository.split('/').map(encodeURIComponent).join('/')}/contents/${suffix}`
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Zentra', ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  if (!response.ok)
    throw new AppError(502, 'githubRead')
  const reader = response.body?.getReader()
  if (!reader)
    throw new AppError(502, 'githubRead')
  let size = 0
  const chunks = []
  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    size += value.byteLength
    if (size > 512000) {
      await reader.cancel()
      throw new AppError(413, 'githubRead')
    }
    chunks.push(value)
  }
  await assertRun(owner, id, run)
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  await activity(id, 'github_read', `${repository}/${path}`, run)
  if (Array.isArray(data))
    return data.slice(0, 100).map(item => ({ name: item.name, path: item.path, type: item.type }))
  if (data.type !== 'file' || data.encoding !== 'base64' || typeof data.content !== 'string')
    throw new AppError(502, 'githubRead')
  return { path: data.path, content: Buffer.from(data.content, 'base64').toString('utf8').slice(0, 12000), untrusted: true }
}
