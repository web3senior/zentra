'use client'
import { useState } from 'react'
import { Sparkle } from '@phosphor-icons/react'
import { site } from '@/config/site'
import styles from './AgentWorkbench.module.scss'
const copy = site.agents
export function AimlKeyFields({ providers, disabled, onSave, onRemove }) {
  const [key, setKey] = useState('')
  async function save() {
    if (disabled || key.trim().length < 10)
      return
    if (await onSave(key.trim()))
      setKey('')
  }
  return <fieldset className={styles.workbench__keyForm}>
   <legend>{copy.aimlKey}</legend>
   <strong>{copy.providerNames.aimlapi} · {providers.aimlapi.ready ? copy.configured : copy.notConfigured}</strong>
   <p>{copy.aimlKeyHint}</p>
   <label>{copy.aimlKey}<input type="password" autoComplete="new-password" spellCheck={false} autoCapitalize="none" maxLength={512} placeholder={providers.aimlapi.ready ? copy.replaceKey : copy.keyPlaceholder} value={key} onChange={event => setKey(event.target.value)} disabled={disabled} onKeyDown={event => {
      if (event.key === 'Enter') {
        event.preventDefault()
        event.stopPropagation()
        void save()
      }
    }}/></label>
   <div className={styles.workbench__formActions}>
    <button type="button" onClick={save} className={styles.workbench__primary} disabled={disabled || key.trim().length < 10}>{copy.saveKey}</button>
    {providers.aimlapi.ready && <button type="button" onClick={onRemove} disabled={disabled}>{copy.removeKey}</button>}
    <a href={copy.getKeyUrl} target="_blank" rel="noreferrer">{copy.getKey}</a>
   </div>
 </fieldset>
}
export default function ProviderConnections(props) {
  return <details className={styles.workbench__setup}>
  <summary><Sparkle size={16}/>{copy.connections}</summary>
  <AimlKeyFields {...props}/>
  <strong>{copy.providerNames.openai} · {props.providers.openai.ready ? copy.configured : copy.notConfigured}</strong>
  {!props.providers.openai.ready && <p>{copy.keySetup}</p>}
 </details>
}
