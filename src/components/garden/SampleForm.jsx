import { useEffect, useId, useRef } from 'react'
import { site } from '@/config/site'
import styles from './Garden.module.scss'
const copy = site.garden
const agentTypes = Object.keys(copy.types)
// Adds a session-only sample resident to the signed-out colony
export function SampleForm({ onClose, onCreate }) {
  const ref = useRef(null)
  const fieldId = useId()
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return <dialog ref={ref} className={styles.garden__form} onCancel={onClose} aria-labelledby={`${fieldId}-title`}>
  <form onSubmit={(event) => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      const name = String(data.get('name')).trim()
      if (name)
        onCreate(name, data.get('type'))
    }}>
   <h2 id={`${fieldId}-title`}>{copy.form.title}</h2><p>{copy.form.note}</p>
   <label>{copy.form.name}<input name="name" required maxLength={32} pattern=".*\S.*" autoFocus autoComplete="off"/></label>
   <label htmlFor={`${fieldId}-type`}>{copy.form.type}</label><select id={`${fieldId}-type`} name="type">{agentTypes.map((type) => <option key={type} value={type}>{copy.types[type]}</option>)}</select>
   <div><button type="button" onClick={onClose}>{copy.form.cancel}</button><button type="submit">{copy.form.save}</button></div>
  </form>
 </dialog>
}
