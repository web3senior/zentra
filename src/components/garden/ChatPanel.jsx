'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { ArrowLeftIcon, ArrowUpIcon, ChatsCircleIcon, DotsThreeIcon, MapPinIcon, SmileyIcon, XIcon } from '@phosphor-icons/react'
import { ContentSpinner, TypingDots } from '@/components/Loading'
import NativePopover from '@/components/ui/NativePopover'
import { api, errorText } from '@/components/agents/clientApi'
import { chatAreas, chatRules } from '@/config/chat'
import { site } from '@/config/site'
import { areaRoom, dmOther } from '@/lib/chatRooms'
import { openSignIn } from '@/lib/signIn'
import styles from './ChatPanel.module.scss'
const copy = site.chat
const time = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' })
// One room: history from the API, live lines over the realtime socket, and the composer
function Room({ room, realtime, you, placeholder, onError }) {
  const queryClient = useQueryClient()
  const [lines, setLines] = useState([])
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [typing, setTyping] = useState({})
  const [reply, setReply] = useState(null)
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState('')
  const list = useRef(null)
  const stick = useRef(true)
  const markRead = useCallback((id) => { if (you && id)
    api('chat/read', 'POST', { room, id }).then(() => queryClient.invalidateQueries({ queryKey: ['chat-dm'] }), () => { }); }, [room, you, queryClient])
  useEffect(() => {
    // Each room mounts fresh (keyed by room), so it starts empty and loading
    let live = true
    api(`chat/rooms/${room}`).then((page) => { if (!live)
      return; setLines(page.lines); setMore(page.more); setLoading(false); markRead(page.lines.at(-1)?.id); }, (err) => { if (live) {
      setLoading(false); onError(errorText(err));
    } })
    realtime.join(room)
    const off = realtime.on((message) => {
      if ((message.t === 'line' || message.t === 'update') && message.line.room === room) {
        setLines((current) => message.t === 'line' ? current.some((l) => l.id === message.line.id) ? current : [...current, message.line] : current.map((l) => l.id === message.line.id ? message.line : l))
        if (message.t === 'line')
          markRead(message.line.id)
      }
      if (message.t === 'line' && message.line.room === room)
        setTyping((current) => { const { [message.line.sender.id]: _, ...rest } = current; return rest; })
      if (message.t === 'typing' && message.room === room)
        setTyping((current) => ({ ...current, [message.id]: { name: message.name, until: Date.now() + 4000 } }))
    })
    return () => { live = false; off(); realtime.part(room); }
  }, [room, realtime, markRead, onError])
  // Typing notes fade after a few seconds
  useEffect(() => {
    if (!Object.keys(typing).length)
      return
    const timer = setInterval(() => setTyping((current) => Object.fromEntries(Object.entries(current).filter(([, t]) => t.until > Date.now()))), 1000)
    return () => clearInterval(timer)
  }, [typing])
  // Follows new lines while the reader is at the bottom
  useEffect(() => {
    const el = list.current
    if (el && stick.current)
      el.scrollTop = el.scrollHeight
  }, [lines, typing])
  const earlier = async () => {
    const el = list.current, before = el?.scrollHeight ?? 0
    const page = await api(`chat/rooms/${room}?before=${lines[0]?.id ?? ''}`).catch((err) => { onError(errorText(err)); return null; })
    if (!page)
      return
    stick.current = false
    setLines((current) => [...page.lines, ...current])
    setMore(page.more)
    requestAnimationFrame(() => { if (el)
      el.scrollTop = el.scrollHeight - before; })
  }
  const answer = (result) => { if (result.t === 'error')
    onError(site.agents.errors[result.code] || site.agents.errors.serverError); return result.t !== 'error'; }
  const submit = async (event) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body)
      return
    stick.current = true
    const ok = answer(await realtime.request(editing ? { t: 'edit', id: editing.id, body } : { t: 'say', room, body, replyTo: reply?.id ?? null }))
    if (ok) {
      setDraft('')
      setReply(null)
      setEditing(null)
    }
  }
  const act = async (message) => answer(await realtime.request(message))
  const userAction = async (path, payload, note) => {
    try {
      await api(path, 'POST', payload)
      if (note)
        onError(note, 'notice')
      if (path === 'chat/block') {
        realtime.raw({ t: 'blocks' })
        setLines((current) => current.filter((l) => l.sender.id !== payload.user))
        queryClient.invalidateQueries({ queryKey: ['chat-dm'] })
      }
    }
    catch (err) {
      onError(errorText(err))
    }
  }
  const byId = new Map(lines.map((l) => [l.id, l]))
  const typers = Object.values(typing).map((t) => t.name)
  return <div className={styles.chat__room}>
   <div ref={list} className={styles.chat__lines} onScroll={(event) => { const el = event.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
    {loading ? <div className={styles.chat__loading}><ContentSpinner label={copy.loading}/></div> : <>
     {more && <button className={styles.chat__more} onClick={earlier}>{copy.more}</button>}
     {!lines.length && <p className={styles.chat__empty}>{copy.empty}</p>}
     {lines.map((line) => {
       const mine = line.sender.id === you?.id
       const quoted = line.replyTo ? byId.get(line.replyTo) : null
       return <article key={line.id} className={clsx(styles.chat__line, mine && styles['chat__line--mine'], line.deleted && styles['chat__line--deleted'])}>
        <header><b>{mine ? copy.you : line.sender.name}</b>{line.sender.up && <img className={styles.chat__up} src={site.upMark.src} alt={site.upMark.alt} title={site.upMark.alt}/>}<time dateTime={new Date(line.created).toISOString()}>{time.format(line.created)}</time>{line.edited && !line.deleted && <small>{copy.edited}</small>}</header>
        {quoted && <blockquote>{quoted.deleted ? copy.deleted : `${quoted.sender.name}: ${quoted.body}`}</blockquote>}
        <p>{line.deleted ? copy.deleted : line.body}</p>
        {!line.deleted && Object.keys(line.reactions).length > 0 && <ul className={styles.chat__reactions}>{Object.entries(line.reactions).map(([emoji, users]) => <li key={emoji}><button aria-pressed={users.includes(you?.id)} disabled={!you?.named} onClick={() => act({ t: 'react', id: line.id, emoji })}>{emoji} {users.length}</button></li>)}</ul>}
        {!line.deleted && you?.named && <div className={styles.chat__actions}>
         <NativePopover placement="top-end" className={styles.chat__menu} trigger={<button aria-label={copy.react} title={copy.react}><SmileyIcon size={15}/></button>}>
          {({ close }) => <div className={styles.chat__emoji}>{chatRules.reactions.map((emoji) => <button key={emoji} onClick={() => { close(); act({ t: 'react', id: line.id, emoji }); }}>{emoji}</button>)}</div>}
         </NativePopover>
         <NativePopover placement="top-end" className={styles.chat__menu} trigger={<button aria-label={copy.options} title={copy.options}><DotsThreeIcon size={15}/></button>}>
          {({ close }) => <div className={styles.chat__options}>
           <button onClick={() => { close(); setEditing(null); setReply(line); }}>{copy.reply}</button>
           {mine && <button onClick={() => { close(); setReply(null); setEditing(line); setDraft(line.body); }}>{copy.edit}</button>}
           {(mine || you.moderator) && <button onClick={() => { close(); act({ t: 'delete', id: line.id }); }}>{copy.delete}</button>}
           {!mine && <button onClick={() => { close(); const reason = window.prompt(copy.reportReason); if (reason?.trim())
             userAction('chat/report', { id: line.id, reason: reason.trim().slice(0, 500) }, copy.reported); }}>{copy.report}</button>}
           {!mine && <button onClick={() => { close(); userAction('chat/block', { user: line.sender.id, blocked: true }, copy.blockedNote); }}>{copy.block}</button>}
           {!mine && you.moderator && <button onClick={() => { close(); userAction('chat/mute', { user: line.sender.id }, copy.muted); }}>{copy.mute}</button>}
          </div>}
         </NativePopover>
        </div>}
       </article>
     })}
     {typers.length > 0 && <div className={styles.chat__typing} role="status"><TypingDots size={20}/>{copy.typing(typers.join(', '))}</div>}
    </>}
   </div>
   {you?.named ? <form className={styles.chat__composer} onSubmit={submit}>
    {(reply || editing) && <p className={styles.chat__context}><span>{editing ? copy.edit : `${copy.replying} ${reply.sender.name}`}</span><button type="button" onClick={() => { setReply(null); setEditing(null); setDraft(''); }}>{copy.cancel}</button></p>}
    <div>
     <textarea value={draft} rows={1} maxLength={chatRules.bodyMax} placeholder={placeholder} aria-label={placeholder}
       onChange={(event) => { setDraft(event.target.value); realtime.raw({ t: 'typing', room }); }}
       onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) {
         event.preventDefault(); event.currentTarget.form.requestSubmit();
       } }}/>
     <button className={styles.chat__send} aria-label={editing ? copy.save : copy.send} disabled={!draft.trim()}><ArrowUpIcon size={16}/></button>
    </div>
   </form> : <button className={styles.chat__signin} onClick={openSignIn}>{copy.signIn}</button>}
  </div>
}
// The colony's chat: the room of the area you stand in (or one you pick), and 1:1 conversations
export default function ChatPanel({ realtime, you, status, area, room: requested, people, names, onClose }) {
  const [tab, setTab] = useState(requested ? 'messages' : 'here')
  const [picked, setPicked] = useState(null)
  const [conversation, setConversation] = useState(requested ?? null)
  const [flash, setFlash] = useState(null)
  const onError = useCallback((text, kind = 'error') => setFlash({ text, kind }), [])
  useEffect(() => { if (!flash)
    return; const timer = setTimeout(() => setFlash(null), 5000); return () => clearTimeout(timer); }, [flash])
  // Whether you moderate comes from the API; who you are from the realtime welcome
  const me = useQuery({ queryKey: ['chat-me'], queryFn: ({ signal }) => api('chat/me', 'GET', undefined, signal), enabled: !!you })
  const viewer = you && { ...you, moderator: !!me.data?.moderator }
  const dms = useQuery({ queryKey: ['chat-dm'], queryFn: ({ signal }) => api('chat/dm', 'GET', undefined, signal), enabled: !!you, select: (data) => data.conversations })
  const here = picked ?? area
  const hereName = copy.areas[here] ?? here
  const other = conversation && you ? dmOther(conversation, you.id) : null
  const otherName = other ? dms.data?.find((c) => c.room === conversation)?.with.name ?? names[other] ?? copy.person : ''
  return <aside className={styles.chat} aria-label={copy.open}>
   <header className={styles.chat__header}>
    <div className={styles.chat__tabs} role="tablist">
     <button role="tab" aria-selected={tab === 'here'} onClick={() => setTab('here')}><MapPinIcon size={15}/>{copy.here}</button>
     <button role="tab" aria-selected={tab === 'messages'} onClick={() => setTab('messages')}><ChatsCircleIcon size={15}/>{copy.messages}{dms.data?.some((c) => c.unread) && <i aria-label={copy.unread}/>}</button>
    </div>
    <button className={styles.chat__close} aria-label={copy.close} onClick={onClose}><XIcon size={18}/></button>
   </header>
   {status !== 'live' && <p className={styles.chat__status}>{copy.offline}</p>}
   {flash && <p role={flash.kind === 'error' ? 'alert' : 'status'} className={clsx(styles.chat__flash, styles[`chat__flash--${flash.kind}`])}>{flash.text}</p>}
   {tab === 'here' && <>
    <div className={styles.chat__place}>
     <label>{copy.area}<select value={here} onChange={(event) => setPicked(event.target.value === area ? null : event.target.value)}>{chatAreas.map((id) => <option key={id} value={id}>{copy.areas[id] ?? id}</option>)}</select></label>
     <small>{copy.peopleHere(people)}</small>
    </div>
    {you ? <Room key={areaRoom(here)} room={areaRoom(here)} realtime={realtime} you={viewer} placeholder={copy.placeholder(hereName)} onError={onError}/> : <button className={styles.chat__signin} onClick={openSignIn}>{copy.signIn}</button>}
   </>}
   {tab === 'messages' && (!you ? <button className={styles.chat__signin} onClick={openSignIn}>{copy.signIn}</button>
     : conversation ? <>
      <button className={styles.chat__back} onClick={() => setConversation(null)}><ArrowLeftIcon size={14}/>{copy.back}</button>
      <Room key={conversation} room={conversation} realtime={realtime} you={viewer} placeholder={copy.placeholder(otherName)} onError={onError}/>
     </>
     : <ul className={styles.chat__conversations}>
      {dms.isPending ? <li className={styles.chat__loading}><ContentSpinner label={copy.loading}/></li>
        : !dms.data?.length ? <li className={styles.chat__empty}>{copy.noConversations}</li>
        : dms.data.map((c) => <li key={c.room}><button onClick={() => setConversation(c.room)}>
          <span className={styles.chat__avatar}>{c.with.name.slice(0, 1).toUpperCase()}</span>
          <span><b>{c.with.name}</b>{c.with.up && <img className={styles.chat__up} src={site.upMark.src} alt={site.upMark.alt} title={site.upMark.alt}/>}<small>{c.last?.deleted ? copy.deleted : c.last?.body}</small></span>
          {c.unread > 0 && <em aria-label={`${c.unread} ${copy.unread}`}>{c.unread}</em>}
         </button></li>)}
     </ul>)}
  </aside>
}
