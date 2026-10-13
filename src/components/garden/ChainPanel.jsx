import { useState } from 'react'
import { ArrowSquareOutIcon, ChatCircleDotsIcon } from '@phosphor-icons/react'
import { site } from '@/config/site'
import { AgentTalk } from './AgentTalk'
import { AgentTools, hasA2a, hasMcp } from './AgentTools'
import styles from './Garden.module.scss'
const copy = site.garden.chain
const short = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`
// External links come from the agent's own registration file: never trusted, never followed for us
const out = { target: '_blank', rel: 'noopener noreferrer nofollow' }
// What a chain's registry says about one agent. Read-only: these agents are not hosted here.
// Agents with an MCP or A2A link can be talked to: Talk swaps the details for a conversation
export function ChainPanel({ district, record }) {
  const [talking, setTalking] = useState(false)
  if (talking)
    return <AgentTalk key={`${district.id}:${record.id}`} district={district} record={record} onBack={() => setTalking(false)}/>
  return <div className={styles.garden__chainInfo}>
  {(hasMcp(record) || hasA2a(record)) && <button type="button" className={styles.garden__heroPrimary} onClick={() => setTalking(true)}><ChatCircleDotsIcon size={16}/>{site.garden.talk.open}</button>}
  <p className={styles.garden__chainState} data-active={record.active}>{record.active ? copy.active : copy.inactive}</p>
  {record.description && <p className={styles.garden__chainText}>{record.description}</p>}
  <dl>
   <div><dt>{copy.identity}</dt><dd>{district.name} · #{new Intl.NumberFormat('en').format(record.id)}</dd></div>
   <div><dt>{copy.owner}</dt><dd><a {...out} href={`${district.explorer}/address/${record.owner}`}>{short(record.owner)}</a></dd></div>
   <div><dt>{copy.feedback}</dt><dd>{new Intl.NumberFormat('en').format(record.feedback)}</dd></div>
   <div><dt>{copy.links}</dt><dd>{record.services.length ? <ul>{record.services.map((service) => <li key={service.url}><a {...out} href={service.url}>{service.name}</a></li>)}</ul> : copy.none}</dd></div>
  </dl>
  {hasMcp(record) && <AgentTools key={`${district.id}:${record.id}`} district={district} record={record}/>}
  <a {...out} className={styles.garden__settings} href={`${district.scan}${record.id}`}><ArrowSquareOutIcon size={14}/>{copy.scan}</a>
  <small className={styles.garden__chainNote}>{copy.note}</small>
 </div>
}
