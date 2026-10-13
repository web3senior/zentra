'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowUpIcon, SlidersHorizontalIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { TypingDots, Spinner } from '@/components/Loading'
import { api, errorText } from '@/components/agents/clientApi'
import ApiRequests from '@/components/agents/ApiConnections'
import { site } from '@/config/site'
import styles from './Garden.module.scss'
const copy = site.agents
// The agent's conversation inside the garden: same endpoints and approval cards as /agents.
// Settings, memory and missions stay on /agents.
export default function GardenChat({ agentId, onActivity }) {
  const [workspace, setWorkspace] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef(null)
  const end = useRef(null)
  useEffect(() => { const abort = new AbortController(); api(`agents/${agentId}`, 'GET', undefined, abort.signal).then(setWorkspace).catch((err) => { if (!abort.signal.aborted)
    setError(errorText(err)); }); return () => { abort.abort(); controller.current?.abort(); }; }, [agentId])
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [workspace?.messages.length, sending])
  async function send(event, approvedTask) {
    event?.preventDefault()
    const text = (approvedTask || draft).trim()
    if (!workspace || !text || sending)
      return
    const current = workspace
    const abort = new AbortController()
    controller.current = abort
    setSending(true)
    setError('')
    if (!approvedTask)
      setDraft('')
    setWorkspace({ ...current, messages: [...current.messages, { id: 'pending', role: 'user', content: text, createdAt: Date.now() }] })
    onActivity?.()
    try {
      setWorkspace(await api(`agents/${agentId}/chat`, 'POST', { text, runId: crypto.randomUUID() }, abort.signal))
    }
    catch (err) {
      setError(errorText(err))
      try {
        const data = await api(`agents/${agentId}`)
        setWorkspace(data)
        if (data.messages.length === current.messages.length)
          setDraft(text)
      }
      catch {
        setWorkspace(current)
        setDraft(text)
      }
    }
    finally {
      setSending(false)
      controller.current = null
      onActivity?.()
    }
  }
  async function stop() { try {
    await api(`agents/${agentId}/stop`, 'POST')
    controller.current?.abort()
  }
  catch (err) {
    setError(errorText(err))
  } }
  if (!workspace)
    return <div className={styles.garden__chatLoading}>{error ? <p role="alert">{error}</p> : <Spinner size={22} color={undefined} className={undefined} label={copy.thinking}/>}</div>
  const paused = workspace.agent.paused
  return <div className={styles.garden__conversation}>
  <div className={styles.garden__messages} role="log" aria-live="polite" aria-label={copy.chat}>
   {!workspace.messages.length && <p className={styles.garden__hello}>{copy.emptyChatText}</p>}
   {workspace.messages.map((message) => <article key={message.id} className={clsx(styles.garden__message, message.role === 'user' && styles['garden__message--user'])}><strong>{message.role === 'user' ? copy.you : workspace.agent.name}</strong><p>{message.content}</p></article>)}
   {sending && <div className={styles.garden__typing}><TypingDots className={undefined}/>{copy.thinking}</div>}
   <div ref={end}/>
  </div>
  <ApiRequests agentId={agentId} disabled={sending} onComplete={() => { void send(undefined, copy.apiConnections.continueApproved); }}/>
  {error && <p className={styles.garden__error} role="alert">{error}</p>}
  {paused && <p className={styles.garden__error}>{copy.errors.paused}</p>}
  <form onSubmit={send} className={styles.garden__composer}>
   <label className={styles.garden__sr} htmlFor={`garden-message-${agentId}`}>{copy.composer}</label>
   <textarea id={`garden-message-${agentId}`} value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} maxLength={6000} placeholder={copy.messagePlaceholder} disabled={sending || paused} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
    event.preventDefault()
    if (draft.trim() && !sending)
      event.currentTarget.form?.requestSubmit()
  } }}/>
   {sending ? <button type="button" onClick={stop}>{copy.stop}</button> : <button className={styles.garden__send} aria-label={copy.send} title={copy.send} disabled={!draft.trim() || paused}><ArrowUpIcon size={18}/></button>}
  </form>
  <Link className={styles.garden__settings} href={`${site.agents.path}?agent=${agentId}`}><SlidersHorizontalIcon size={14}/>{site.garden.settings}</Link>
 </div>
}
