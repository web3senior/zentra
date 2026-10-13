import { formatUnits } from 'viem'
import { ArrowSquareOutIcon, LockSimpleIcon } from '@phosphor-icons/react'
import { site } from '@/config/site'
import styles from './Garden.module.scss'
const copy = site.garden.jobs
const short = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`
// Briefs and links come from strangers' posts: plain text only, links never followed for us
const out = { target: '_blank', rel: 'noopener noreferrer nofollow' }
const number = new Intl.NumberFormat('en', { maximumFractionDigits: 4 })
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const UNITS = [['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3_600], ['minute', 60]]
function when(seconds) {
  const delta = seconds - Date.now() / 1000
  const [unit, size] = UNITS.find(([, s]) => Math.abs(delta) >= s) ?? UNITS.at(-1)
  return relative.format(Math.round(delta / size), unit)
}
// Without a known token the amount is not shown rather than guessed
const reward = (job) => job.token ? `${number.format(Number(formatUnits(BigInt(job.reward), job.token.decimals)))} ${job.token.symbol} ${copy.perSlot}` : copy.unknownToken
function Job({ job }) {
  const agents = job.payouts.filter((payout) => payout.agentId > 0)
  return <article className={styles.garden__job}>
  <header>
   <span className={styles.garden__jobStatus} data-status={job.status}>{copy.statuses[job.status]}</span>
   <span>{job.category}</span>
   {job.sealed && <span title={copy.sealed}><LockSimpleIcon size={12}/>{copy.sealed}</span>}
  </header>
  <p className={styles.garden__chainText}>{job.brief || copy.noBrief}</p>
  <dl>
   <div><dt>{reward(job)}</dt><dd>{job.paid}/{job.slots} {copy.slots}</dd></div>
   <div><dt>{job.status === 'open' ? copy.closes : copy.closed}</dt><dd>{job.closed ? copy.endings[job.closed] : when(job.deadline)}</dd></div>
   {agents.map((payout) => <div key={payout.reply}><dt>{copy.agent} #{payout.agentId}</dt><dd>{copy.paid} · {copy.rating} {payout.rating}</dd></div>)}
  </dl>
  <a {...out} href={job.url}><ArrowSquareOutIcon size={14}/>{copy.view}</a>
 </article>
}
// One chain's job board: open and in-review jobs first, then recently finished ones. Read-only.
export function JobBoardPanel({ board }) {
  const active = board.jobs.filter((job) => job.status !== 'done')
  const finished = board.jobs.filter((job) => job.status === 'done')
  return <div className={styles.garden__chainInfo}>
  {active.length ? <><h3 className={styles.garden__jobHeading}>{copy.active}</h3>{active.map((job) => <Job key={job.id} job={job}/>)}</> : <p className={styles.garden__chainState}>{copy.empty}</p>}
  {finished.length > 0 && <><h3 className={styles.garden__jobHeading}>{copy.finished}</h3>{finished.map((job) => <Job key={job.id} job={job}/>)}</>}
  <dl>
   <div><dt>{copy.contract}</dt><dd><a {...out} href={`${board.explorer}/address/${board.contract}`}>{short(board.contract)}</a></dd></div>
   <div><dt>{copy.synced}</dt><dd>{board.synced ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(board.synced) : copy.never}</dd></div>
  </dl>
  <small className={styles.garden__chainNote}>{copy.note}</small>
 </div>
}
