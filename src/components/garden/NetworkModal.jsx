import { useEffect, useId, useRef } from 'react'
import { ArrowSquareOutIcon, XIcon } from '@phosphor-icons/react'
import { site } from '@/config/site'
import styles from './Garden.module.scss'
const copy = site.garden.network
const count = (n) => new Intl.NumberFormat('en').format(n)
const short = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`
const out = { target: '_blank', rel: 'noopener noreferrer' }
// A chain district's network: its registries and what the colony's index holds for it
// onSelectAgent: open one of the district's agents (the modal closes first)
export function NetworkModal({ district, onClose, onSelectAgent }) {
  const ref = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  const { stats } = district
  const feedback = district.records.reduce((sum, agent) => sum + agent.feedback, 0)
  return <dialog ref={ref} className={styles.garden__form} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget)
    onClose(); }} aria-labelledby={titleId}>
  <div className={styles.garden__network}>
   <header><div><small>{copy.eyebrow}</small><h2 id={titleId}>{district.name}</h2></div><button aria-label={copy.close} onClick={onClose}><XIcon size={18}/></button></header>
   <dl className={styles.garden__stats}>
    <div><dt>{copy.registered}</dt><dd>{count(stats.registered)}</dd></div>
    <div><dt>{copy.readable}</dt><dd>{count(stats.readable)}</dd></div>
    <div><dt>{copy.active}</dt><dd>{count(stats.active)}</dd></div>
   </dl>
   <section className={styles.garden__networkAgents}>
    <h3>{copy.agents}</h3>
    {district.agents.length ? <ul>{district.agents.map((agent, i) => <li key={agent.id}><button onClick={() => onSelectAgent(agent.id)}><span data-tone={district.id}>{agent.name.slice(0, 1)}</span><b>{agent.name}</b><small>#{count(district.records[i].id)} · {district.records[i].active ? copy.agentActive : copy.agentInactive}</small></button></li>)}</ul> : <p>{copy.noAgents}</p>}
   </section>
   <dl className={styles.garden__facts}>
    <div><dt>{copy.shown}</dt><dd>{count(stats.shown)}</dd></div>
    <div><dt>{copy.feedback}</dt><dd>{stats.feedbackIndexed ? count(feedback) : copy.notIndexed}</dd></div>
    <div><dt>{copy.chainId}</dt><dd>{count(district.chainId)}</dd></div>
    <div><dt>{copy.identity}</dt><dd><a {...out} href={`${district.explorer}/address/${district.identity}`}>{short(district.identity)}</a></dd></div>
    <div><dt>{copy.reputation}</dt><dd><a {...out} href={`${district.explorer}/address/${district.reputation}`}>{short(district.reputation)}</a></dd></div>
    <div><dt>{copy.synced}</dt><dd>{district.synced ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(district.synced) : copy.never}</dd></div>
   </dl>
   <div className={styles.garden__networkLinks}>
    <a {...out} href={district.explorer}><ArrowSquareOutIcon size={14}/>{copy.explorer}</a>
    <a {...out} href={district.scan.replace(/agents\/[^/]+\/$/, '')}><ArrowSquareOutIcon size={14}/>{copy.scan}</a>
   </div>
   <small className={styles.garden__chainNote}>{copy.note}</small>
  </div>
 </dialog>
}
