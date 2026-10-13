'use client'
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Cat, Plus, ChatCircle, SlidersHorizontal, Notebook, ArrowUp, SignOut, Trash, LockKey } from '@phosphor-icons/react'
import clsx from 'clsx'
import { site } from '@/config/site'
import { Spinner, TypingDots } from '@/components/Loading'
import { agentProviders } from '@/config/agentProviders'
import ProviderConnections, { AimlKeyFields } from './ProviderConnections'
import { api, errorText, RequestError } from './clientApi'
import ApiRequests from './ApiConnections'
import AgentOperations from './AgentOperations'
import MusicUpload from './MusicUpload'
import SignInForm from '@/components/auth/SignInForm'
import styles from './AgentWorkbench.module.scss'
const copy = site.agents
const defaults = { name: '', instructions: '', provider: 'aimlapi', model: agentProviders.aimlapi.defaultModel, memoryEnabled: true, filesEnabled: true, fileWriteMode: 'ask', webHosts: [], githubRepos: [], musicUrl: '', paused: false, dailyRuns: 20, maxTurns: 3, maxOutputTokens: 1024 }
function AgentForm({ agent, busy, onSave, onCancel, onDelete, providers, onSaveKey, onRemoveKey }) {
  const [values, setValues] = useState(agent || defaults)
  const [hosts, setHosts] = useState(values.webHosts.join('\n'))
  const [repos, setRepos] = useState(values.githubRepos.join('\n'))
  const split = (value) => value.split(/[\n,]/).map(item => item.trim()).filter(Boolean)
  const set = (key, value) => setValues(previous => ({ ...previous, [key]: value }))
  return <form className={styles.workbench__form} onSubmit={event => { event.preventDefault(); onSave({ ...values, webHosts: split(hosts), githubRepos: split(repos) }); }}>
  <div className={styles.workbench__sectionHeading}><span className={styles.workbench__avatar}><Cat size={32} weight="duotone"/></span><div><h2>{agent ? copy.config : copy.newAgent}</h2><p>{agent ? copy.purposeHint : copy.createIntro}</p></div></div>
  <label>{copy.name}<input autoFocus={!agent} required maxLength={60} value={values.name} onChange={e => set('name', e.target.value)} placeholder={copy.namePlaceholder}/></label>
  <label>{copy.purpose}<textarea required rows={5} maxLength={6000} value={values.instructions} onChange={e => set('instructions', e.target.value)} placeholder={copy.purposePlaceholder}/></label>
  <label>{copy.provider}<select value={values.provider} onChange={event => {
      const provider = event.target.value
      setValues(previous => ({ ...previous, provider, model: agentProviders[provider].defaultModel }))
    }}>{Object.keys(agentProviders).map(provider => <option key={provider} value={provider}>{copy.providerNames[provider]}</option>)}</select></label>
  {values.provider === 'aimlapi' && <AimlKeyFields providers={providers} disabled={busy} onSave={onSaveKey} onRemove={onRemoveKey}/>}
  {values.provider === 'openai' && !providers.openai.ready && <p>{copy.keySetup}</p>}
  {values.provider === 'aimlapi' ? <label>{copy.model}<input required maxLength={160} value={values.model} onChange={event => set('model', event.target.value)}/><small>{copy.aimlModelHint} <a href={copy.modelListUrl} target="_blank" rel="noreferrer">{copy.modelList}</a></small></label> : <label>{copy.model}<select value={values.model} onChange={() => { }}><option value="gpt-4.1-mini">{copy.modelLabel}</option></select></label>}
  <label className={styles.workbench__check}><input type="checkbox" checked={values.memoryEnabled} onChange={e => set('memoryEnabled', e.target.checked)}/><span>{copy.memorySkill}<small>{copy.memoryHint}</small></span></label>
  <fieldset><legend>{copy.permissions}</legend>
   <label className={styles.workbench__check}><input type="checkbox" checked={values.filesEnabled} onChange={e => set('filesEnabled', e.target.checked)}/>{copy.filesEnabled}</label>
   <label>{copy.fileWriteMode}<select value={values.fileWriteMode} onChange={e => set('fileWriteMode', e.target.value)}>{['deny', 'ask', 'allow'].map(mode => <option key={mode} value={mode}>{copy.writeModes[mode]}</option>)}</select></label>
   <label>{copy.music}<input type="text" inputMode="url" maxLength={500} placeholder="ipfs://…" value={values.musicUrl} onChange={e => set('musicUrl', e.target.value)}/><small>{copy.musicHint}</small></label>
   {agent ? <MusicUpload agentId={agent.id}/> : <p className={styles.workbench__musicFile}>{copy.musicSaveFirst}</p>}
   <label>{copy.webHosts}<textarea rows={3} value={hosts} onChange={e => setHosts(e.target.value)}/><small>{copy.webHostsHint}</small></label>
   <label>{copy.githubRepos}<textarea rows={3} value={repos} onChange={e => setRepos(e.target.value)}/><small>{copy.githubReposHint}</small></label>
  </fieldset>
  {agent && <>
   <fieldset><legend>{copy.limits}</legend><div className={styles.workbench__limits}>
    <label>{copy.dailyRuns}<input type="number" required min={1} max={100} value={values.dailyRuns} onChange={e => set('dailyRuns', Number(e.target.value))}/></label>
    <label>{copy.maxTurns}<input type="number" required min={1} max={5} value={values.maxTurns} onChange={e => set('maxTurns', Number(e.target.value))}/></label>
    <label>{copy.maxOutputTokens}<input type="number" required min={128} max={2048} value={values.maxOutputTokens} onChange={e => set('maxOutputTokens', Number(e.target.value))}/></label>
   </div><p>{copy.limitHint}</p></fieldset>
   <label className={styles.workbench__check}><input type="checkbox" checked={values.paused} onChange={e => set('paused', e.target.checked)}/><span>{copy.paused}</span></label>
  </>}
  {!agent && <p className={styles.workbench__fine}>{copy.createNote}</p>}
  <div className={styles.workbench__formActions}>
   <button disabled={busy} type="submit" className={styles.workbench__primary}>{busy ? copy.working : agent ? copy.save : copy.create}<Plus size={16}/></button>
   {!agent && <button type="button" onClick={onCancel} disabled={busy}>{copy.cancel}</button>}
   {agent && <button type="button" className={styles.workbench__danger} disabled={busy} onClick={onDelete}><Trash size={16}/>{copy.delete}</button>}
  </div>
 </form>
}
export default function AgentWorkbench({ initiallyCreating = false }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(initiallyCreating)
  const [tab, setTab] = useState('chat')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState('')
  const [memory, setMemory] = useState('')
  const controller = useRef(null)
  const selectionVersion = useRef(0)
  const messagesEnd = useRef(null)
  useEffect(() => {
    const abort = new AbortController()
    api('session', 'GET', undefined, abort.signal).then((data) => {
      setSession(data)
      // Links from the garden: ?agent=<id> opens that chat, ?create=1 the creation form
      const params = new URLSearchParams(window.location.search), linked = params.get('agent')
      if (linked && data.agents.some(agent => agent.id === linked))
        selectAgent(linked)
      else if (params.has('create'))
        setCreating(true)
    }).catch(err => {
      if (err instanceof RequestError && err.status === 401)
        return
      if (!abort.signal.aborted)
        setError(errorText(err))
    }).finally(() => { if (!abort.signal.aborted)
      setLoading(false); })
    return () => { abort.abort(); controller.current?.abort(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on load
  }, [])
  useEffect(() => { messagesEnd.current?.scrollIntoView({ block: 'nearest' }); }, [selected?.messages.length, sending])
  function report(err) {
    setError(errorText(err))
    if (err instanceof RequestError && err.status === 401) {
      setSession(null)
      setSelected(null)
    }
  }
  function applyWorkspace(workspace) {
    setSelected(workspace)
    setMemory(workspace.memory)
    setSession(previous => previous ? { ...previous, agents: previous.agents.map(agent => agent.id === workspace.agent.id ? workspace.agent : agent) } : previous)
  }
  async function selectAgent(id) {
    const version = ++selectionVersion.current
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const data = await api(`agents/${id}`)
      if (version === selectionVersion.current) {
        applyWorkspace(data)
        setCreating(false)
        setTab('chat')
        setDraft('')
      }
    }
    catch (err) {
      report(err)
    }
    finally {
      if (version === selectionVersion.current)
        setBusy(false)
    }
  }
  async function signedIn() {
    setError('')
    setSession(await api('session'))
  }
  async function saveAgent(values) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (creating) {
        const { agent } = await api('agents', 'POST', values)
        setSession(previous => previous ? { ...previous, agents: [...previous.agents, agent] } : previous)
        applyWorkspace({ agent, memory: '', messages: [] })
        setCreating(false)
        setTab('chat')
      }
      else if (selected) {
        const { agent } = await api(`agents/${selected.agent.id}`, 'PATCH', values)
        applyWorkspace({ ...selected, agent })
        setNotice(copy.saved)
      }
    }
    catch (err) {
      report(err)
    }
    finally {
      setBusy(false)
    }
  }
  async function remove() {
    if (!selected || !window.confirm(copy.deleteConfirm))
      return
    setBusy(true)
    setError('')
    try {
      await api(`agents/${selected.agent.id}`, 'DELETE')
      setSession(previous => previous ? { ...previous, agents: previous.agents.filter(agent => agent.id !== selected.agent.id) } : previous)
      setSelected(null)
      setNotice('')
    }
    catch (err) {
      report(err)
    }
    finally {
      setBusy(false)
    }
  }
  async function send(event, approvedTask) {
    event?.preventDefault()
    if (!selected || !(approvedTask || draft).trim() || sending)
      return
    const current = selected
    const text = (approvedTask || draft).trim()
    const abort = new AbortController()
    controller.current = abort
    setSending(true)
    setError('')
    setNotice('')
    if (!approvedTask)
      setDraft('')
    setSelected({ ...current, messages: [...current.messages, { id: 'pending', role: 'user', content: text, createdAt: Date.now() }] })
    try {
      applyWorkspace(await api(`agents/${current.agent.id}/chat`, 'POST', { text, runId: crypto.randomUUID() }, abort.signal))
    }
    catch (err) {
      report(err)
      try {
        const data = await api(`agents/${current.agent.id}`)
        applyWorkspace(data)
        if (data.messages.length === current.messages.length)
          setDraft(text)
      }
      catch {
        setSelected(current)
        setDraft(text)
      }
    }
    finally {
      setSending(false)
      controller.current = null
    }
  }
  async function saveMemory(event) {
    event.preventDefault()
    if (!selected)
      return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api(`agents/${selected.agent.id}/memory`, 'PUT', { memory })
      setSelected({ ...selected, memory })
      setNotice(copy.saved)
    }
    catch (err) {
      report(err)
    }
    finally {
      setBusy(false)
    }
  }
  async function stop() {
    if (!selected)
      return
    try {
      await api(`agents/${selected.agent.id}/stop`, 'POST')
      controller.current?.abort()
    }
    catch (err) {
      report(err)
    }
  }
  async function togglePause() {
    if (!selected)
      return
    setBusy(true)
    setError('')
    try {
      await api(`agents/${selected.agent.id}/pause`, 'POST', { paused: !selected.agent.paused })
      applyWorkspace(await api(`agents/${selected.agent.id}`))
    }
    catch (err) {
      report(err)
    }
    finally {
      setBusy(false)
    }
  }
  async function signOut() {
    setBusy(true)
    try {
      await api('auth/logout', 'POST')
      queryClient.resetQueries()
      setSession(null)
      setSelected(null)
      setDraft('')
      setMemory('')
      setError('')
      setNotice('')
    }
    catch (err) {
      report(err)
    }
    finally {
      setBusy(false)
    }
  }
  async function saveKey(key) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { providers } = await api('providers/aimlapi', 'PUT', { apiKey: key })
      setSession(previous => previous ? { ...previous, providers } : previous)
      setNotice(copy.keySaved)
      return true
    }
    catch (err) {
      report(err)
      return false
    }
    finally {
      setBusy(false)
    }
  }
  async function removeKey() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { providers } = await api('providers/aimlapi', 'DELETE')
      setSession(previous => previous ? { ...previous, providers } : previous)
      setNotice(copy.keyRemoved)
    }
    catch (err) {
      report(err)
    }
    finally {
      setBusy(false)
    }
  }
  const flash = <>{error && <div role="alert" className={styles.workbench__error}>{error}</div>}{notice && <div role="status" className={styles.workbench__notice}>{notice}</div>}</>
  if (loading)
    return <main className={styles.workbench}><div className={styles.workbench__loading}><Spinner label={copy.loading} className={undefined}/>{copy.loading}</div></main>
  if (!session)
    return <main className={styles.workbench}>
  <div className={styles.workbench__auth}>
   <div className={styles.workbench__intro}><span className={styles.workbench__eyebrow}>{site.wordmark}</span><Cat size={80} weight="duotone"/><h1>{copy.heading}</h1><p>{copy.description}</p><span className={styles.workbench__privacy}><LockKey size={16}/>{copy.workspace}</span></div>
   <div className={styles.workbench__form}><SignInForm onSignedIn={() => void signedIn().catch(report)}/></div>
  </div>
 </main>
  const ready = selected ? session.providers[selected.agent.provider].ready : session.providers.aimlapi.ready || session.providers.openai.ready
  return <main className={styles.workbench}>
  <header className={styles.workbench__heading}><div><span className={styles.workbench__eyebrow}>{copy.eyebrow}</span><h1>{copy.heading}</h1><p>{copy.description}</p></div><span className={styles.workbench__privacy}><LockKey size={16}/>{copy.workspace}</span></header>
  <div className={styles.workbench__shell}>
   <aside className={styles.workbench__sidebar}>
    <div className={styles.workbench__account}><span className={styles.workbench__avatar}><Cat size={24}/></span><div><strong>{session.username}</strong><small>{site.name}</small></div><button aria-label={copy.logout} title={copy.logout} onClick={signOut} disabled={busy || sending}><SignOut size={18}/></button></div>
    <button className={styles.workbench__primary} disabled={busy || sending} onClick={() => { setCreating(true); setError(''); setNotice(''); }}><Plus size={18}/>{copy.create}</button>
    <span className={styles.workbench__eyebrow}>{copy.yourAgents}<span>{new Intl.NumberFormat().format(session.agents.length)}</span></span>
    <nav aria-label={copy.yourAgents} className={styles.workbench__agentList}>
     {session.agents.map(agent => <button key={agent.id} disabled={busy || sending} aria-pressed={!creating && selected?.agent.id === agent.id} onClick={() => selectAgent(agent.id)} className={clsx(styles.workbench__agent, !creating && selected?.agent.id === agent.id && styles['workbench__agent--active'])}><span className={styles.workbench__avatar}><Cat size={25} weight="duotone"/></span><span><strong>{agent.name}</strong><small>{agent.paused ? copy.pausedLabel : copy.ready}</small></span></button>)}
     {!session.agents.length && <p className={styles.workbench__fine}>{copy.emptyList}</p>}
    </nav>
    <div className={styles.workbench__connection}><span className={clsx(styles.workbench__dot, ready && styles['workbench__dot--ready'])}/>{ready ? copy.configured : copy.notConfigured}</div>
   </aside>
   <section className={styles.workbench__panel} aria-busy={busy}>
    {!creating && (!selected || tab !== 'config') && <ProviderConnections providers={session.providers} disabled={busy || sending} onSave={saveKey} onRemove={removeKey}/>}
    {selected && !creating && !ready && <p className={styles.workbench__keyHint}>{copy.missingKey}</p>}
    {flash}
    {creating ? <AgentForm key="create" busy={busy} onSave={saveAgent} onCancel={() => setCreating(false)} onDelete={() => { }} providers={session.providers} onSaveKey={saveKey} onRemoveKey={removeKey}/> : selected ? <>
     <div className={styles.workbench__agentHeader}><span className={styles.workbench__avatar}><Cat size={30} weight="duotone"/></span><div><h2>{selected.agent.name}</h2><p>{selected.agent.paused ? copy.pausedLabel : copy.ready} · {selected.agent.model}</p></div><span className={styles.workbench__usage}>{new Intl.NumberFormat().format(selected.agent.runsToday)} / {selected.agent.dailyRuns} {copy.runs}</span></div>
     <div className={styles.workbench__operationBar}><button type="button" disabled={busy} onClick={togglePause}>{selected.agent.paused ? copy.resumeNow : copy.pauseNow}</button><button type="button" onClick={stop}>{copy.stopWork}</button></div>
     <div className={styles.workbench__tabs} role="tablist" aria-label={copy.workspace}>{[{ id: 'chat', label: copy.chat, Icon: ChatCircle }, { id: 'config', label: copy.config, Icon: SlidersHorizontal }, { id: 'memory', label: copy.memory, Icon: Notebook }, { id: 'work', label: copy.operations.work, Icon: SlidersHorizontal }, { id: 'files', label: copy.operations.files, Icon: Notebook }, { id: 'activity', label: copy.operations.activity, Icon: ChatCircle }].map(item => <button key={item.id} role="tab" id={`tab-${item.id}`} aria-controls={`panel-${item.id}`} aria-selected={tab === item.id} disabled={sending || busy} className={clsx(tab === item.id && styles['workbench__tab--active'])} onClick={() => { setTab(item.id); setNotice(''); }}><item.Icon size={18}/>{item.label}</button>)}</div>
     <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={styles.workbench__tabPanel}>
      {(tab === 'work' || tab === 'files' || tab === 'activity') && <AgentOperations key={selected.agent.id} agentId={selected.agent.id} view={tab}/>}
      {tab === 'config' && <AgentForm key={selected.agent.id + JSON.stringify(selected.agent)} agent={selected.agent} busy={busy} onSave={saveAgent} onCancel={() => setTab('chat')} onDelete={remove} providers={session.providers} onSaveKey={saveKey} onRemoveKey={removeKey}/>}
      {tab === 'memory' && <form className={styles.workbench__form} onSubmit={saveMemory}><h2>{copy.memory}</h2><p>{copy.notesHint}</p>{!selected.agent.memoryEnabled && <p>{copy.notesOff}</p>}<label>{copy.memory}<textarea rows={14} maxLength={12000} value={memory} onChange={event => setMemory(event.target.value)} placeholder={copy.notesPlaceholder}/></label><button className={styles.workbench__primary} disabled={busy}>{copy.save}</button></form>}
      {tab === 'chat' && <div className={styles.workbench__chat}>
       <div className={styles.workbench__messages} role="log" aria-live="polite" aria-label={copy.chat}>
        {!selected.messages.length && <div className={styles.workbench__welcome}><span className={styles.workbench__cat}><Cat size={68} weight="duotone"/></span><h2>{copy.emptyChat}</h2><p>{copy.emptyChatText}</p></div>}
        {selected.messages.map(message => <article key={message.id} className={clsx(styles.workbench__message, message.role === 'user' && styles['workbench__message--user'])}><strong>{message.role === 'user' ? copy.you : selected.agent.name}</strong><p>{message.content}</p></article>)}
        {sending && <div className={styles.workbench__thinking}><TypingDots className={undefined}/>{copy.thinking}</div>}
        <div ref={messagesEnd}/>
       </div>
       <ApiRequests key={selected.agent.id} agentId={selected.agent.id} disabled={sending || busy} onComplete={() => { void send(undefined, copy.apiConnections.continueApproved); }}/>
       <form onSubmit={send} className={styles.workbench__composer}><label className={styles.workbench__sr} htmlFor="agent-message">{copy.composer}</label><textarea id="agent-message" value={draft} onChange={event => setDraft(event.target.value)} rows={2} maxLength={6000} placeholder={copy.messagePlaceholder} disabled={sending || selected.agent.paused || !ready} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault()
        if (draft.trim() && !sending)
          event.currentTarget.form?.requestSubmit()
      } }}/>{sending ? <button type="button" onClick={stop}>{copy.stop}</button> : <button className={styles.workbench__primary} aria-label={copy.send} title={copy.send} disabled={!draft.trim() || !ready || selected.agent.paused || busy}><ArrowUp size={21}/></button>}</form>
       <p className={styles.workbench__context}>{copy.contextNote}</p>
      </div>}
     </div>
    </> : <div className={styles.workbench__empty}><span className={styles.workbench__cat}><Cat size={86} weight="duotone"/></span><span className={styles.workbench__eyebrow}>{site.name}</span><h2>{copy.emptyTitle}</h2><p>{copy.emptyText}</p><button className={styles.workbench__primary} onClick={() => setCreating(true)}><Plus size={18}/>{copy.create}</button></div>}
   </section>
  </div>
 </main>
}
