'use client'
import { useEffect, useState } from 'react'
import { Spinner } from '@/components/Loading'
import { site } from '@/config/site'
import { api, errorText, RequestError } from './clientApi'
import ApiRequests from './ApiConnections'
import styles from './AgentWorkbench.module.scss'
const copy = site.agents.operations
const date = (value) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(value)
function MissionForm({ mission, busy, action }) {
  const [draft, setDraft] = useState(mission)
  return <form className={styles.workbench__card} onSubmit={event => { event.preventDefault(); void action('mission', 'PUT', draft); }}>
  <h2>{copy.mission}</h2><p>{copy.missionHint}</p>
  <label>{copy.prompt}<textarea rows={5} required maxLength={4000} value={draft.prompt} placeholder={copy.promptPlaceholder} onChange={event => setDraft({ ...draft, prompt: event.target.value })}/></label>
  <label className={styles.workbench__check}><input type="checkbox" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })}/><span>{copy.schedule}</span></label>
  <div className={styles.workbench__limits}>
   <label>{copy.interval}<input type="number" min={15} max={10080} required value={draft.intervalMinutes} onChange={event => setDraft({ ...draft, intervalMinutes: Number(event.target.value) })}/></label>
   <label>{copy.retries}<input type="number" min={0} max={3} required value={draft.maxRetries} onChange={event => setDraft({ ...draft, maxRetries: Number(event.target.value) })}/></label>
  </div>
  <label className={styles.workbench__check}><input type="checkbox" checked={draft.eventsEnabled} onChange={event => setDraft({ ...draft, eventsEnabled: event.target.checked })}/><span>{copy.eventsEnabled}</span></label>
  <p>{copy.retryHint}</p>
  <button className={styles.workbench__primary} disabled={busy}>{copy.saveMission}</button>
 </form>
}
export default function AgentOperations({ agentId, view }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [eventToken, setEventToken] = useState('')
  const [eventUrl, setEventUrl] = useState('')
  const [file, setFile] = useState({ name: copy.defaultFileName, content: '' })
  const base = `agents/${agentId}`
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      if (document.hidden)
        return
      try {
        setData(await api(`agents/${agentId}/operations`, 'GET', undefined, controller.signal))
      }
      catch (err) {
        if (!controller.signal.aborted)
          setError(errorText(err))
      }
    }
    void load()
    const timer = setInterval(load, 5000)
    return () => { controller.abort(); clearInterval(timer); }
  }, [agentId])
  async function action(path, method, body, message = copy.saved) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await api(`${base}/${path}`, method, body)
      if (path === 'event-key') {
        setEventToken(response.token || '')
        setEventUrl(`${location.origin}/api/zentra/events/${agentId}`)
      }
      setData(await api(`${base}/operations`))
      setNotice(message)
      return true
    }
    catch (err) {
      setError(errorText(err))
      return false
    }
    finally {
      setBusy(false)
    }
  }
  async function upload(selected) {
    if (!selected)
      return
    if (selected.size > 40000 || !/\.(txt|md|json|csv)$/i.test(selected.name)) {
      setError(site.agents.errors.fileSize)
      return
    }
    try {
      setFile({ name: selected.name, content: await selected.text() })
      setError('')
    }
    catch (err) {
      setError(errorText(err))
    }
  }
  function download(item) {
    const url = URL.createObjectURL(new Blob([item.content], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = item.name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function connectGithub(event) {
    event.preventDefault()
    if (await action('github', 'PUT', { token: githubToken }))
      setGithubToken('')
  }
  if (!data)
    return <div className={styles.workbench__form}>{error ? <p role="alert">{error}</p> : <Spinner label={copy.loading} className={undefined}/>}</div>
  return <div className={styles.workbench__operations}>
  {error && <div role="alert" className={styles.workbench__error}>{error}</div>}
  {notice && <div role="status" className={styles.workbench__notice}>{notice}</div>}
  <div className={styles.workbench__operationBar}><strong>{data.workerOnline ? copy.workerOnline : copy.workerOffline}</strong><button disabled={busy} onClick={() => action('operations', 'GET')}>{copy.refresh}</button></div>
  {view === 'work' && <>
   <p>{copy.workerHint}</p>
   <MissionForm key={JSON.stringify(data.mission)} mission={data.mission} busy={busy} action={action}/>
   <div className={styles.workbench__operationBar}><p>{copy.nextRun}: {data.mission.enabled ? date(data.next) : copy.none}</p><button className={styles.workbench__primary} disabled={busy || !data.mission.prompt} onClick={() => action('run', 'POST', { eventId: crypto.randomUUID() }, copy.queued)}>{copy.runNow}</button></div>
   <details className={styles.workbench__card}><summary>{copy.eventTriggers}</summary><p>{copy.eventHint}</p>
    <div className={styles.workbench__formActions}><button disabled={busy || !data.mission.prompt} onClick={() => action('event-key', 'POST')}>{copy.createEventKey}</button>{data.eventKeyConfigured && <button disabled={busy} onClick={() => action('event-key', 'DELETE')}>{copy.revokeEventKey}</button>}</div>
    {eventToken && <><label>{copy.eventUrl}<input readOnly value={eventUrl} onFocus={event => event.target.select()}/></label><label>{copy.eventToken}<input readOnly value={eventToken} onFocus={event => event.target.select()}/></label></>}
   </details>
   <form className={styles.workbench__card} onSubmit={connectGithub}><h2>{copy.github}</h2><p>{copy.githubHint}</p>
    {data.githubConnected && <p>{copy.configured}</p>}
    <label>{copy.githubToken}<input type="password" autoComplete="new-password" minLength={10} maxLength={512} required value={githubToken} onChange={event => setGithubToken(event.target.value)}/></label>
    <div className={styles.workbench__formActions}><button disabled={busy || githubToken.length < 10}>{copy.saveToken}</button>{data.githubConnected && <button type="button" disabled={busy} onClick={() => action('github', 'DELETE')}>{copy.disconnect}</button>}</div>
   </form>
   <div className={styles.workbench__card}><h2>{copy.wallet}</h2><p>{copy.walletHint}</p></div>
  </>}
  {view === 'files' && <>
   <form className={styles.workbench__card} onSubmit={event => { event.preventDefault(); void action('files', 'PUT', file); }}>
    <h2>{copy.files}</h2><p>{copy.uploadHint}</p>
    <label>{copy.upload}<input type="file" accept=".txt,.md,.json,.csv" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }}/></label>
    <label>{copy.fileName}<input required maxLength={100} value={file.name} onChange={event => setFile({ ...file, name: event.target.value })}/></label>
    <label>{copy.content}<textarea rows={9} maxLength={40000} value={file.content} onChange={event => setFile({ ...file, content: event.target.value })}/></label>
    <div className={styles.workbench__formActions}><button className={styles.workbench__primary} disabled={busy || data.running}>{copy.saveFile}</button><button type="button" onClick={() => setFile({ name: copy.defaultFileName, content: '' })}>{copy.newFile}</button></div>
   </form>
   {!data.files.length && <p>{copy.noFiles}</p>}
   {data.files.map(item => <div key={item.name} className={styles.workbench__operationBar}><button onClick={() => setFile(item)}>{item.name}</button><small>{date(item.updated)}</small><button onClick={() => download(item)}>{copy.download}</button><button disabled={busy || data.running} onClick={() => { if (confirm(copy.deleteFileConfirm))
      void action('files', 'DELETE', { name: item.name }); }}>{copy.deleteFile}</button></div>)}
  </>}
  {view === 'activity' && <>
   <ApiRequests agentId={agentId} history/>
   <section className={styles.workbench__card}><h2>{copy.approvals}</h2><p>{copy.approvalHint}</p>
    {!data.approvals.some(item => item.status === 'pending') && <p>{copy.noApprovals}</p>}
    {data.approvals.filter(item => item.status === 'pending').map(item => <details key={item.id}><summary>{item.name} · {date(item.created)}</summary><pre className={styles.workbench__result}>{item.content}</pre><div className={styles.workbench__formActions}><button disabled={busy || data.running} onClick={() => action('approvals', 'POST', { id: item.id, approve: true })}>{copy.approve}</button><button disabled={busy || data.running} onClick={() => action('approvals', 'POST', { id: item.id, approve: false })}>{copy.reject}</button></div></details>)}
   </section>
   <section className={styles.workbench__card}><h2>{copy.history}</h2>{!data.jobs.length && <p>{copy.noJobs}</p>}
    {data.jobs.map(job => <details key={job.id} className={styles.workbench__job}><summary>{copy.statuses[job.status] || job.status} · {copy.sources[job.source]} · {date(job.created)}</summary><p>{new Intl.NumberFormat().format(job.attempts)} {copy.attempts}</p><p>{job.prompt}</p>{job.error && <p role="status">{errorText(new RequestError(job.error, 400))}</p>}{job.result && <><strong>{copy.result}</strong><pre className={styles.workbench__result}>{job.result}</pre></>}{['queued', 'running'].includes(job.status) && <button disabled={busy} onClick={() => action('jobs', 'DELETE', { jobId: job.id })}>{copy.cancelJob}</button>}</details>)}
   </section>
   <section className={styles.workbench__card}><h2>{copy.log}</h2>{!data.activity.length && <p>{copy.noActivity}</p>}{data.activity.map(item => <div key={item.id} className={styles.workbench__log}><small>{date(item.created)}</small><p>{copy.events[item.kind] || item.kind}{item.detail ? ` · ${item.detail}` : ''}</p></div>)}</section>
  </>}
 </div>
}
