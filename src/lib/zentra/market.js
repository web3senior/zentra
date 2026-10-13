import { z } from 'zod'
import { registries } from '@/config/chains'
import { text } from './registry'
// The colony's NFT market: Hup's HupTrade listings, read-only, from Hup's public API (which drops
// listings that can no longer be bought) and its metadata cache for each NFT's name and image.
// Names, descriptions and images are written by strangers: capped plain text, https images only,
// never put in a hosted agent's prompt. Buying happens on hup.social.
const LIMIT = 1_000_000
const statuses = { active: 'active', sold: 'sold' }
const sorts = { newest: 'newest', price_asc: 'price_asc', price_desc: 'price_desc' }
export const marketQuerySchema = z.object({
  status: z.enum(Object.keys(statuses)).default('active'),
  sort: z.enum(Object.keys(sorts)).default('newest'),
  page: z.coerce.number().int().min(1).max(50).default(1),
})
async function hupJson(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json', 'User-Agent': 'Zentra/1.0', ...init?.headers } })
  if (!response.ok)
    throw new Error(`hup ${response.status}`)
  const body = await response.text()
  if (body.length > LIMIT)
    throw new Error('size')
  const json = JSON.parse(body)
  if (!json?.success)
    throw new Error('hup')
  return json
}
const ZERO = '0x0000000000000000000000000000000000000000'
const address = (value) => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value) ? value.toLowerCase() : null
const units = (value) => typeof value === 'string' && /^\d{1,78}$/.test(value) ? value : null
// An image the browser can load: IPFS through LUKSO's gateway, Hup's own image proxy, or https
function image(market, raw, ipfsGateway) {
  const value = text(raw, 1000)
  if (value.startsWith('ipfs://'))
    return ipfsGateway + value.slice(7).replace(/^ipfs\//, '')
  if (value.startsWith('/api/nft/image?'))
    return market.site + value
  try {
    return new URL(value).protocol === 'https:' ? value : ''
  }
  catch {
    return ''
  }
}
function token(row) {
  const symbol = text(row.symbol ?? row.last_sale_symbol, 12)
  const decimals = Number(row.decimals ?? row.last_sale_decimals)
  return symbol && Number.isInteger(decimals) && decimals >= 0 && decimals <= 36 ? { symbol, decimals } : null
}
function listing(registry, row, meta) {
  const { market, ipfsGateway } = registry
  const collection = address(row.collection), seller = address(row.wallet_address)
  const id = Number(row.listing_id)
  if (!collection || !seller || !Number.isInteger(id) || typeof row.token_id !== 'string')
    return null
  const sold = row.status === 2
  return {
    id, chain: registry.id, url: `${market.listing}${id}`, collection, collectionUrl: `${market.collection}${collection}`,
    tokenId: text(row.token_id, 80), name: text(meta?.name, 80), collectionName: text(meta?.collectionName, 60), description: text(meta?.description, 300),
    image: image(market, meta?.image, ipfsGateway), price: units(sold ? row.last_sale_price ?? row.price : row.price), token: token(row),
    paymentToken: address(row.payment_token) ?? ZERO, native: !row.payment_token || row.payment_token === ZERO, status: sold ? 'sold' : 'active',
    listedAt: Number(row.listed_at) * 1000 || null, soldAt: sold ? Number(row.last_sale_at) * 1000 || null : null,
    seller: { address: seller, name: text(row.display_name, 40), avatar: image(market, row.profile_image, ipfsGateway) },
  }
}
async function readPage(registry, { status, sort, page }) {
  const { market } = registry
  const query = new URLSearchParams({ networkId: String(registry.chainId), status, sort: status === 'sold' ? 'recently_sold' : sort, page: String(page), limit: String(market.page) })
  const listings = await hupJson(`${market.api}nfts?${query}`)
  const rows = Array.isArray(listings.data) ? listings.data.slice(0, market.page) : []
  // Names and images: one batch for the page; a failure leaves the listings without them
  let metas = []
  if (rows.length)
    metas = await hupJson(`${market.api}nfts/metadata`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens: rows.map((row) => ({ chainId: registry.chainId, collection: row.collection, tokenId: row.token_id, isLsp8: !!row.is_lsp8 })) }) })
      .then((json) => Array.isArray(json.data) ? json.data : []).catch(() => [])
  return { items: rows.map((row, i) => listing(registry, row, metas[i])).filter(Boolean), more: !!listings.meta?.hasMore, synced: Date.now() }
}
// Pages are kept for refreshMinutes; a stale page is served while it refreshes, a missing one is awaited
const cache = new Map()
export async function marketPage(input) {
  const query = marketQuerySchema.parse(input)
  const registry = registries.find((r) => r.market)
  if (!registry)
    return null
  const key = `${registry.id}:${query.status}:${query.sort}:${query.page}`
  const entry = cache.get(key) ?? {}
  cache.set(key, entry)
  const fresh = entry.value && Date.now() - entry.value.synced < registry.market.refreshMinutes * 60_000
  if (!fresh) {
    entry.loading ??= readPage(registry, query).then((value) => { entry.value = value }).finally(() => { entry.loading = null })
    if (entry.value)
      entry.loading.catch(() => { })
    else
      await entry.loading
  }
  return { chain: registry.id, chainId: registry.chainId, name: registry.name, explorer: registry.explorer, home: `${registry.market.site}/nfts`, ...query, ...entry.value }
}
