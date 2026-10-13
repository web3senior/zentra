'use client'
import { useEffect, useState } from 'react'
import { site } from '@/config/site'
import { api, errorText } from './clientApi'
import styles from './AgentWorkbench.module.scss'
const copy = site.agents.apiConnections
function RequestCard({ item, base, refresh, disabled, onComplete }) {
  const [credential, setCredential] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const needsCredential = item.connection.startsWith('direct:') && item.connection !== 'direct:none'
  async function decide(approve) {
    setBusy(true)
    setError('')
    try {
      await api(`${base}/api-approval`, 'POST', { id: item.id, approve, credential: approve && needsCredential ? credential : undefined })
      setCredential('')
      await refresh()
      if (approve)
        onComplete?.()
    }
    catch (err) {
      setError(errorText(err))
      await refresh()
    }
    finally {
      setBusy(false)
    }
  }
  return <section className={styles.workbench__card}>
  <strong>{item.name}</strong><small>{copy.statuses[item.status]}</small>
  <p>{new URL(item.url).hostname}</p>
  <details><summary>{copy.details}</summary><p>{item.method} {item.url}</p>{item.body && <pre className={styles.workbench__result}>{item.body}</pre>}</details>
  {error && <p role="alert">{error}</p>}
  {item.status === 'pending' && <>
   {needsCredential && <label>{copy.secret}<input type="password" autoComplete="new-password" maxLength={512} value={credential} onChange={e => setCredential(e.target.value)}/><small>{copy.oneTimeSecret}</small></label>}
   <div className={styles.workbench__formActions}><button disabled={disabled || busy || (needsCredential && !credential)} onClick={() => decide(true)}>{copy.approve}</button><button disabled={busy} onClick={() => decide(false)}>{copy.reject}</button></div>
  </>}
  {item.result !== null && <details><summary>{copy.result}</summary><pre className={styles.workbench__result}>{item.result}</pre><p>{copy.continue}</p></details>}
 </section>
}
export default function ApiRequests({ agentId, history = false, disabled, onComplete }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const base = `agents/${agentId}`
  useEffect(() => {
    const abort = new AbortController()
    const load = () => { if (!document.hidden)
      api(`${base}/apis`, 'GET', undefined, abort.signal).then(setData).catch(err => { if (!abort.signal.aborted)
        setError(errorText(err)); }); }
    load()
    const timer = setInterval(load, 2000)
    return () => { abort.abort(); clearInterval(timer); }
  }, [base])
  const requests = data?.requests.filter(item => history || item.status === 'pending' || item.status === 'executing') || []
  if (!requests.length && !error)
    return null
  return <div className={styles.workbench__operations}>
  <strong>{history ? copy.requests : copy.yourApproval}</strong>
  {error && <p role="alert">{error}</p>}
  {requests.map(item => <RequestCard key={item.id} item={item} base={base} disabled={disabled} onComplete={onComplete} refresh={async () => setData(await api(`${base}/apis`))}/>)}
 </div>
}
