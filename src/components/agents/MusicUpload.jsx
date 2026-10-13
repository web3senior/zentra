'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { MusicNotes, UploadSimple, Trash } from '@phosphor-icons/react'
import { site } from '@/config/site'
import { Spinner } from '@/components/Loading'
import { errorText, RequestError } from './clientApi'
import styles from './AgentWorkbench.module.scss'
const copy = site.agents
const size = (bytes) => new Intl.NumberFormat('en', { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 }).format(bytes / 1048576)
// Uploads the agent's plot music straight to the server (stored in MySQL), separately from Save.
// An upload plays instead of the link above it.
export default function MusicUpload({ agentId }) {
  const [music, setMusic] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef(null)
  const fieldId = useId()
  const base = `/api/zentra/agents/${agentId}/music`
  useEffect(() => {
    const abort = new AbortController()
    fetch(`${base}-info`, { signal: abort.signal, cache: 'no-store' }).then(r => r.json()).then(data => setMusic(data.music ?? null)).catch(() => { })
    return () => abort.abort()
  }, [base])
  async function upload(file) {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(base, { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) } })
      const data = await response.json()
      if (!response.ok)
        throw new RequestError(data.error, response.status)
      setMusic(data.music)
    }
    catch (err) {
      setError(errorText(err))
    }
    finally {
      setBusy(false)
      if (input.current)
        input.current.value = ''
    }
  }
  async function remove() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(base, { method: 'DELETE' })
      if (!response.ok)
        throw new RequestError((await response.json()).error, response.status)
      setMusic(null)
    }
    catch (err) {
      setError(errorText(err))
    }
    finally {
      setBusy(false)
    }
  }
  return <div className={styles.workbench__music}>
  {music && <p className={styles.workbench__musicFile}><MusicNotes size={16}/><span>{copy.musicUploaded} <b>{music.name}</b> · {size(music.size)}</span></p>}
  <div className={styles.workbench__musicActions}>
   <input ref={input} id={fieldId} type="file" accept="audio/*,.mp3,.ogg,.wav,.m4a,.flac,.webm" className={styles.workbench__sr} disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file)
    void upload(file); }}/>
   <label htmlFor={fieldId} className={styles.workbench__musicButton} aria-disabled={busy}>{busy ? <Spinner size={16} color={undefined} className={undefined} label={copy.musicUploading}/> : <UploadSimple size={16}/>}{music ? copy.musicReplace : copy.musicUpload}</label>
   {music && <button type="button" onClick={remove} disabled={busy}><Trash size={16}/>{copy.musicRemove}</button>}
  </div>
  {error && <p className={styles.workbench__musicError} role="alert">{error}</p>}
 </div>
}
