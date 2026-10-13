'use client'
import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { formatUnits } from 'viem'
import { ArrowSquareOutIcon, ImageIcon } from '@phosphor-icons/react'
import { ContentSpinner } from '@/components/Loading'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import BuyButton from './BuyButton'
import { api } from '@/components/agents/clientApi'
import { site } from '@/config/site'
import styles from './MarketGrid.module.scss'
const copy = site.market
// Links lead to Hup and to strangers' collections: never followed for us
const out = { target: '_blank', rel: 'noopener noreferrer nofollow' }
const number = new Intl.NumberFormat('en', { maximumFractionDigits: 4 })
const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium' })
const short = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`
// Without a known token the price is not shown rather than guessed
const price = (item) => item.token && item.price ? `${number.format(Number(formatUnits(BigInt(item.price), item.token.decimals)))} ${item.token.symbol}` : copy.unknownToken
export function marketQuery(status, sort) {
  return {
    queryKey: ['market', status, sort],
    queryFn: ({ pageParam, signal }) => api(`market?${new URLSearchParams({ status, sort, page: String(pageParam) })}`, 'GET', undefined, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => last.more && last.page < 50 ? last.page + 1 : undefined,
    staleTime: 60_000,
  }
}
function Card({ item, explorer }) {
  const [broken, setBroken] = useState(false)
  return <article className={styles.market__card}>
  <a {...out} href={item.url} className={styles.market__art} aria-label={`${copy.view}: ${item.name || copy.untitled}`}>
   {item.image && !broken
      ? <img src={item.image} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)}/>
      : <ImageIcon size={32}/>}
   {item.status === 'sold' && <span className={styles.market__sold}>{copy.sold}</span>}
  </a>
  <div className={styles.market__body}>
   <a {...out} href={item.collectionUrl} className={styles.market__collection}>{item.collectionName || short(item.collection)}</a>
   <h3 className={styles.market__name} title={item.name}>{item.name || copy.untitled}</h3>
   <p className={styles.market__price}>{price(item)}</p>
   <p className={styles.market__seller}>
    <Avatar src={item.seller.avatar} name={item.seller.name || item.seller.address.slice(2)} size={20}/>
    <span>{item.seller.name || short(item.seller.address)}</span>
    {item.status === 'sold' && item.soldAt && <time dateTime={new Date(item.soldAt).toISOString()}>{date.format(item.soldAt)}</time>}
   </p>
   <BuyButton item={item} explorer={explorer}/>
   <a {...out} href={item.url} className={clsx(styles.market__view, item.status === 'sold' && styles['market__view--main'])}>
    <ArrowSquareOutIcon size={12}/>{copy.view}
   </a>
  </div>
 </article>
}
// Hup's NFT listings: for sale (sortable) or recently sold, a page at a time. compact: the colony's
// panel, one narrow column of cards; otherwise the market page's full grid. Read-only.
export default function MarketGrid({ compact = false }) {
  const [status, setStatus] = useState('active')
  const [sort, setSort] = useState('newest')
  const query = useInfiniteQuery(marketQuery(status, sort))
  const items = query.data?.pages.flatMap((page) => page.items) ?? []
  return <div className={clsx(styles.market, compact && styles['market--compact'])}>
  <div className={styles.market__bar}>
   <div className={styles.market__tabs} role="tablist">
    {Object.entries(copy.tabs).map(([key, label]) => <button key={key} role="tab" aria-selected={status === key} onClick={() => setStatus(key)}>{label}</button>)}
   </div>
   {status === 'active' && <label className={styles.market__sort}>
    <span>{copy.sortLabel}</span>
    <select value={sort} onChange={(event) => setSort(event.target.value)}>
     {Object.entries(copy.sorts).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
   </label>}
  </div>
  {query.isPending ? <ContentSpinner label={copy.loading} className={styles.market__state}/>
      : query.isError && !items.length ? <div className={styles.market__state}><p>{copy.failed}</p><Button size="sm" variant="secondary" onClick={() => query.refetch()}>{copy.retry}</Button></div>
        : !items.length ? <p className={styles.market__state}>{copy.empty}</p>
          : <div className={styles.market__grid}>{items.map((item) => <Card key={`${item.chain}:${item.id}`} item={item} explorer={query.data.pages[0].explorer}/>)}</div>}
  {query.hasNextPage && <Button variant="secondary" block={compact} loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()} className={styles.market__more}>{copy.more}</Button>}
  <small className={styles.market__note}>{copy.note}</small>
 </div>
}
