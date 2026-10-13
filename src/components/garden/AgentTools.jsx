'use client'
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { PlayIcon, PlugsConnectedIcon } from '@phosphor-icons/react'
import { ContentSpinner, Spinner } from '@/components/Loading'
import { sessionQuery } from '@/components/Profile'
import { api } from '@/components/agents/clientApi'
import { openSignIn } from '@/lib/signIn'
import { site } from '@/config/site'
import styles from './AgentTools.module.scss'
const copy = site.garden.tools
// An agent advertises MCP as a service named like MCP; only https ones are asked
export const hasMcp = (record) => record.services.some((service) => /mcp/i.test(service.name) && service.url.startsWith('https://'))
export const hasA2a = (record) => record.services.some((service) => /a2a/i.test(service.name) && service.url.startsWith('https://'))
// A tool's inputs as form fields, and the values a submitted form gives them
export function ToolFields({ tool }) {
  return tool.fields.map((field) => <label key={field.name} className={clsx(field.type === 'boolean' && styles.tools__check)}>
   <span>{field.name}{field.required && ' *'}</span>
   {field.type === 'boolean' ? <input type="checkbox" name={field.name}/>
      : field.options.length ? <select name={field.name} required={field.required} defaultValue=""><option value="" disabled={field.required}>{copy.choose}</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
        : <input name={field.name} type={field.type === 'string' ? 'text' : 'number'} step={field.type === 'integer' ? 1 : 'any'} required={field.required} maxLength={500} placeholder={field.description}/>}
  </label>)
}
export function toolValues(tool, form) {
  const values = {}
  for (const field of tool.fields) {
    if (field.type === 'boolean')
      values[field.name] = form.get(field.name) === 'on'
    else {
      const raw = String(form.get(field.name) ?? '').trim()
      if (raw)
        values[field.name] = field.type === 'string' ? raw : Number(raw)
    }
  }
  return values
}
// A tool a visitor can run: free, reading or talking, with inputs a form can ask for
export const runnable = (tool) => tool.callable && tool.usable && !tool.paid
export function errorMessage(error) {
  if (error?.status === 401)
    return copy.signIn
  if (error?.status === 429)
    return copy.limit
  return copy.unreachable
}
// One tool: its description, and for a free tool that only reads or talks, a small form built
// from its inputs. The answer is the agent's own text, shown as plain text.
function Tool({ district, record, tool, signedIn }) {
  const run = useMutation({ mutationFn: (values) => api(`chains/${district.id}/agents/${record.id}/tools`, 'POST', { tool: tool.name, arguments: values }) })
  const blocked = tool.paid ? copy.paid : !tool.callable ? copy.acts : !tool.usable ? copy.unsupported : ''
  function submit(event) {
    event.preventDefault()
    run.mutate(toolValues(tool, new FormData(event.currentTarget)))
  }
  return <details className={styles.tools__tool}>
  <summary><code>{tool.name}</code>{blocked && <span className={styles.tools__tag}>{tool.paid ? copy.tags.paid : !tool.callable ? copy.tags.acts : copy.tags.unsupported}</span>}</summary>
  {tool.description && <p className={styles.tools__description}>{tool.description}</p>}
  {blocked ? <p className={styles.tools__blocked}>{blocked}</p>
      : !signedIn ? <button type="button" className={styles.tools__signIn} onClick={openSignIn}>{copy.signIn}</button>
        : <form className={styles.tools__form} onSubmit={submit}>
     <ToolFields tool={tool}/>
     <button type="submit" className={styles.tools__run} disabled={run.isPending}>
      {run.isPending ? <Spinner size={14} color="currentColor" label={copy.running}/> : <PlayIcon size={14}/>}{run.isPending ? copy.running : copy.run}
     </button>
    </form>}
  {run.isError && <p role="alert" className={styles.tools__blocked}>{errorMessage(run.error)}</p>}
  {run.data && <div className={styles.tools__answer} data-ok={run.data.ok}>
    <span>{run.data.paid ? copy.paidAnswer : run.data.ok ? copy.result : copy.failed}</span>
    {run.data.output && <pre>{run.data.output}</pre>}
   </div>}
 </details>
}
// A chain agent's MCP tools, asked of its server when the panel opens (cached there for ten minutes)
export function AgentTools({ district, record }) {
  const session = useQuery(sessionQuery)
  const tools = useQuery({
    queryKey: ['agent-tools', district.id, record.id],
    queryFn: ({ signal }) => api(`chains/${district.id}/agents/${record.id}/tools`, 'GET', undefined, signal),
    staleTime: 5 * 60_000,
  })
  return <section className={styles.tools}>
  <h3 className={styles.tools__title}><PlugsConnectedIcon size={14}/>{copy.title}</h3>
  {tools.isPending ? <ContentSpinner size={18} label={copy.loading} className={styles.tools__state}/>
      : tools.isError || !tools.data.live ? <p className={styles.tools__status} data-live="false">{copy.offline}</p>
        : <>
     <p className={styles.tools__status} data-live="true">{copy.live}{tools.data.server?.name && ` · ${tools.data.server.name}`}</p>
     {tools.data.tools.length ? tools.data.tools.map((tool) => <Tool key={tool.name} district={district} record={record} tool={tool} signedIn={!!session.data}/>) : <p className={styles.tools__description}>{copy.none}</p>}
     <small className={styles.tools__note}>{copy.note}</small>
    </>}
 </section>
}
