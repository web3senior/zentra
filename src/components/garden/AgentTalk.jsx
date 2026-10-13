'use client'
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeftIcon, ArrowUpIcon, LightningIcon } from '@phosphor-icons/react'
import { TypingDots } from '@/components/Loading'
import { sessionQuery } from '@/components/Profile'
import { api } from '@/components/agents/clientApi'
import { openSignIn } from '@/lib/signIn'
import { site } from '@/config/site'
import { ToolFields, errorMessage, hasMcp, runnable, toolValues } from './AgentTools'
import styles from './AgentTalk.module.scss'
const copy = site.garden.talk
const KEEP = 60
// get_light_levels → Light levels: a tool's name as a button label
const label = (name) => { const words = name.replace(/^(get|list|fetch|read|query|search|lookup|check|describe)[_.-]/i, '').replace(/[_.-]+/g, ' ').trim(); return words.charAt(0).toUpperCase() + words.slice(1); }
const storageKey = (district, record) => `zentra-talk:${district.id}:${record.id}`
function load(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(saved) ? saved.filter((line) => line && typeof line.text === 'string') : []
  }
  catch {
    return []
  }
}
// A Telegram-style conversation with a chain agent. Typed messages go to its MCP chat tool or A2A
// endpoint (the server picks); its free reading tools are quick-reply buttons, and a tool with
// inputs opens a small form above them. The conversation stays in this browser only.
export function AgentTalk({ district, record, onBack }) {
  const key = storageKey(district, record)
  const [lines, setLines] = useState(() => load(key))
  const [open, setOpen] = useState(null)
  const list = useRef(null)
  const session = useQuery(sessionQuery)
  const signedIn = !!session.data
  const route = useQuery({ queryKey: ['agent-talk', district.id, record.id], queryFn: ({ signal }) => api(`chains/${district.id}/agents/${record.id}/talk`, 'GET', undefined, signal), staleTime: 5 * 60_000 })
  const tools = useQuery({ queryKey: ['agent-tools', district.id, record.id], queryFn: ({ signal }) => api(`chains/${district.id}/agents/${record.id}/tools`, 'GET', undefined, signal), enabled: hasMcp(record), staleTime: 5 * 60_000 })
  const buttons = tools.data?.live ? tools.data.tools.filter((tool) => runnable(tool) && !/^(chat|ask)(?:[_.-]|$)/i.test(tool.name)) : []
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(lines.slice(-KEEP)))
    }
    catch { }
    list.current?.scrollTo({ top: list.current.scrollHeight })
  }, [key, lines])
  const add = (line) => setLines((current) => [...current, { at: Date.now(), ...line }].slice(-KEEP))
  const answer = (result) => add(result.paid ? { from: 'system', text: copy.paid } : { from: 'agent', text: result.output || copy.empty, failed: !result.ok })
  const send = useMutation({
    mutationFn: (text) => api(`chains/${district.id}/agents/${record.id}/talk`, 'POST', { text }),
    onSuccess: answer,
    onError: (error) => add({ from: 'system', text: errorMessage(error) }),
  })
  const run = useMutation({
    mutationFn: ({ tool, values }) => api(`chains/${district.id}/agents/${record.id}/tools`, 'POST', { tool: tool.name, arguments: values }),
    onSuccess: answer,
    onError: (error) => add({ from: 'system', text: errorMessage(error) }),
  })
  const busy = send.isPending || run.isPending
  function submit(event) {
    event.preventDefault()
    const input = event.currentTarget.elements.namedItem('text')
    const text = input.value.trim()
    if (!text || busy)
      return
    add({ from: 'me', text })
    input.value = ''
    send.mutate(text)
  }
  function tap(tool) {
    if (busy)
      return
    if (tool.fields.length) {
      setOpen(open?.name === tool.name ? null : tool)
      return
    }
    add({ from: 'me', text: `/${tool.name}`, command: true })
    run.mutate({ tool, values: {} })
  }
  function submitTool(event) {
    event.preventDefault()
    const values = toolValues(open, new FormData(event.currentTarget))
    const shown = Object.entries(values).map(([name, value]) => `${name}: ${value}`).join(', ')
    add({ from: 'me', text: `/${open.name}${shown ? ` ${shown}` : ''}`, command: true })
    run.mutate({ tool: open, values })
    setOpen(null)
  }
  const canType = route.data?.via
  return <div className={styles.talk}>
  <button type="button" className={styles.talk__back} onClick={onBack}><ArrowLeftIcon size={14}/>{copy.back}</button>
  <ol ref={list} className={styles.talk__lines} aria-live="polite">
   {!lines.length && <li className={styles.talk__hello}>{copy.hello(record.name)}</li>}
   {lines.map((line, i) => <li key={`${line.at}:${i}`} className={styles.talk__line} data-from={line.from} data-failed={line.failed || undefined} data-command={line.command || undefined}>{line.text}</li>)}
   {busy && <li className={styles.talk__line} data-from="agent"><TypingDots size={22}/></li>}
  </ol>
  {!signedIn ? <button type="button" className={styles.talk__signIn} onClick={openSignIn}>{copy.signIn}</button> : <>
    {open && <form className={styles.talk__toolForm} onSubmit={submitTool}>
      <strong>/{open.name}</strong>
      <ToolFields tool={open}/>
      <button type="submit" disabled={busy}>{copy.run}</button>
     </form>}
    {buttons.length > 0 && <div className={styles.talk__keyboard} role="group" aria-label={copy.keyboard}>
      {buttons.map((tool) => <button key={tool.name} type="button" title={tool.description} aria-pressed={open?.name === tool.name} disabled={busy} onClick={() => tap(tool)}>
        {tool.fields.length > 0 && <LightningIcon size={12}/>}{label(tool.name)}
       </button>)}
     </div>}
    {route.isPending ? null : canType ? <form className={styles.talk__composer} onSubmit={submit}>
      <input name="text" maxLength={1000} autoComplete="off" placeholder={copy.placeholder(record.name)} aria-label={copy.placeholder(record.name)}/>
      <button type="submit" aria-label={copy.send} disabled={busy}><ArrowUpIcon size={16}/></button>
     </form> : <p className={styles.talk__note}>{buttons.length ? copy.buttonsOnly : copy.cannot}</p>}
   </>}
  <small className={styles.talk__note}>{copy.note}</small>
 </div>
}
