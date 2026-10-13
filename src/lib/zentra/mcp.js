import { z } from 'zod'
import { registries } from '@/config/chains'
import { publicRequest, text } from './registry'
import { AppError, db, rateLimit } from './store'
// Talking to chain agents' MCP servers (docs/plans/agent-mcp-tools.md): list an agent's tools and
// call the free ones for a signed-in visitor. Streamable HTTP only, through publicRequest (https,
// public IPv4 pinned, no redirects, size and time limits). Everything a server says is untrusted:
// capped plain text, never HTML, never put in a hosted agent's prompt. Paid (x402) calls are not
// made; a tool that asks for payment says so.
const PROTOCOL = '2025-06-18'
const LIST_TTL = 10 * 60_000
const MAX_PROPERTIES = 12
const MAX_RESULT = 20_000
const lists = new Map()
let rpcId = 0
// An agent's link of one kind (MCP, A2A) from its stored registration file: https only
async function serviceUrl(chain, id, kind) {
  if (!registries.some((r) => r.id === chain))
    throw new AppError(404, 'notFound')
  const row = await db().prepare('SELECT doc FROM chain_agents WHERE chain = ? AND agent_id = ?').get(chain, id)
  const services = row?.doc ? JSON.parse(row.doc).services ?? [] : []
  return services.find((s) => kind.test(s.name) && s.url.startsWith('https://'))?.url ?? null
}
async function mcpUrl(chain, id) {
  const url = await serviceUrl(chain, id, /mcp/i)
  if (!url)
    throw new AppError(404, 'notFound')
  return url
}
// One JSON-RPC exchange; the reply is JSON or a server-sent event stream carrying it
async function rpc(url, session, message, { timeout = 15000, limit = 262144 } = {}) {
  const response = await publicRequest(url, {
    method: 'POST', timeout, limit, body: JSON.stringify(message),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': PROTOCOL, ...(session ? { 'Mcp-Session-Id': session } : {}) },
  })
  const next = response.headers['mcp-session-id'] ?? session
  if (!('id' in message))
    return { session: next }
  if (response.status < 200 || response.status >= 300)
    throw new Error(`status ${response.status}`)
  const messages = String(response.headers['content-type']).includes('text/event-stream')
    ? response.text.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => { try {
      return JSON.parse(line.slice(5))
    }
    catch {
      return null
    } })
    : [JSON.parse(response.text)]
  const reply = messages.find((m) => m && m.id === message.id)
  if (!reply)
    throw new Error('no reply')
  return { session: next, reply }
}
async function connect(url) {
  const { session, reply } = await rpc(url, null, { jsonrpc: '2.0', id: ++rpcId, method: 'initialize', params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'Zentra', version: '1.0' } } })
  if (reply.error)
    throw new Error('initialize')
  await rpc(url, session, { jsonrpc: '2.0', method: 'notifications/initialized' }).catch(() => { })
  return { session, server: { name: text(reply.result?.serverInfo?.name, 60), version: text(reply.result?.serverInfo?.version, 20) } }
}
// A tool's inputs, reduced to what a simple form can ask for: flat strings, numbers and switches
function cleanSchema(schema) {
  const properties = schema && typeof schema.properties === 'object' ? Object.entries(schema.properties).slice(0, MAX_PROPERTIES) : []
  const fields = properties.flatMap(([name, prop]) => {
    const type = ['string', 'number', 'integer', 'boolean'].includes(prop?.type) ? prop.type : null
    if (!/^[\w.-]{1,64}$/.test(name) || !type)
      return []
    const options = Array.isArray(prop.enum) ? prop.enum.filter((v) => typeof v === 'string').slice(0, 30).map((v) => text(v, 60)) : []
    return [{ name, type, description: text(prop.description, 200), options }]
  })
  const required = Array.isArray(schema?.required) ? schema.required.filter((name) => fields.some((f) => f.name === name)) : []
  // A tool needing an input this form cannot ask for (an object, a list) cannot be run from here
  const usable = !(Array.isArray(schema?.required) && schema.required.some((name) => !fields.some((f) => f.name === name)))
  return { fields: fields.map((f) => ({ ...f, required: required.includes(f.name) })), usable }
}
// Visitors may only run tools that read or talk: marked read-only by the server, or named as a
// lookup or a chat. Anything else (switching a device on, sending, writing) could act on the real
// world for its owner, so it is listed but not run from here; nothing marked destructive runs.
const READING = /^(get|list|search|read|fetch|lookup|query|resolve|find|check|describe|explain|estimate|quote|preview|echo|chat|ask|ping|health|status|info|help)(?:[_.-]|$)/i
const callableTool = (name, annotations) => annotations?.destructiveHint !== true && (annotations?.readOnlyHint === true || READING.test(name))
export function cleanTool(tool) {
  const name = text(tool?.name, 64)
  if (!/^[\w.-]{1,64}$/.test(name))
    return null
  const description = text(tool.description, 600)
  return { name, description, paid: /x402|\bpaid\b|per call/i.test(description), callable: callableTool(name, tool.annotations), ...cleanSchema(tool.inputSchema) }
}
// An agent's tools, kept for ten minutes. live: false when the server could not be reached
export async function agentTools(chain, id) {
  const url = await mcpUrl(chain, id)
  const cached = lists.get(url)
  if (cached && Date.now() - cached.at < LIST_TTL)
    return cached.value
  await rateLimit('mcp:list:global', 600)
  let value
  try {
    const { session, server } = await connect(url)
    const { reply } = await rpc(url, session, { jsonrpc: '2.0', id: ++rpcId, method: 'tools/list', params: {} })
    const tools = (Array.isArray(reply.result?.tools) ? reply.result.tools : []).slice(0, 20).map(cleanTool).filter(Boolean)
    value = { url, live: true, server, tools, checked: Date.now() }
  }
  catch {
    value = { url, live: false, server: null, tools: [], checked: Date.now() }
  }
  lists.set(url, { at: Date.now(), value })
  return value
}
const callSchema = z.object({ tool: z.string().min(1).max(64), arguments: z.record(z.string(), z.union([z.string().max(500), z.number().finite(), z.boolean()])).default({}) })
// The result as plain text: text parts, then structured content as JSON, capped
function resultText(result) {
  const parts = (Array.isArray(result?.content) ? result.content : []).map((part) => part?.type === 'text' ? String(part.text ?? '') : `[${text(part?.type, 20) || 'content'}]`)
  if (result?.structuredContent && !parts.length)
    parts.push(JSON.stringify(result.structuredContent, null, 2))
  const all = parts.join('\n\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  return all.length > MAX_RESULT ? `${all.slice(0, MAX_RESULT)}…` : all
}
// Calls one free tool for a signed-in visitor. Inputs are checked against the listed tool; a tool
// that answers with a payment request is reported as paid, never paid
export async function callAgentTool(owner, chain, id, input) {
  const { tool: name, arguments: args } = callSchema.parse(input)
  await rateLimit(`mcp:call:${owner}`, 20)
  await rateLimit('mcp:call:global', 300)
  const listing = await agentTools(chain, id)
  const tool = listing.tools.find((t) => t.name === name)
  if (!listing.live || !tool || !tool.usable || !tool.callable || tool.paid)
    throw new AppError(404, 'notFound')
  const values = {}
  for (const field of tool.fields) {
    const value = args[field.name]
    if (value === undefined || value === '') {
      if (field.required)
        throw new AppError(400, 'invalid')
      continue
    }
    const ok = field.type === 'boolean' ? typeof value === 'boolean' : field.type === 'string' ? typeof value === 'string' && (!field.options.length || field.options.includes(value)) : typeof value === 'number' && (field.type === 'number' || Number.isInteger(value))
    if (!ok)
      throw new AppError(400, 'invalid')
    values[field.name] = value
  }
  return runTool(listing, name, values)
}
const paidReply = (value) => /payment ?required|x402|\b402\b/i.test(value)
async function runTool(listing, name, values) {
  try {
    const { session } = await connect(listing.url)
    const { reply } = await rpc(listing.url, session, { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: values } }, { timeout: 30000, limit: 524288 })
    const message = reply.error ? text(reply.error.message, 300) : ''
    const output = reply.error ? message : resultText(reply.result)
    const paid = paidReply(`${message} ${output}`)
    return { ok: !reply.error && !reply.result?.isError, paid, output: paid ? '' : output }
  }
  catch {
    throw new AppError(502, 'mcpUnreachable')
  }
}
// Talking to an agent (docs/plans/agent-talk.md). A message goes to the agent's MCP chat tool
// when it has one (a free tool named chat or ask taking one text), otherwise to its A2A endpoint
// (message/send), found from its agent card. Replies are untrusted plain text, like tool answers.
const talkSchema = z.object({ text: z.string().trim().min(1).max(1000) })
const cards = new Map()
// A tool that takes a message: free, runnable, and asking for one text input
export function chatTool(tools) {
  return tools.find((t) => /^(chat|ask)(?:[_.-]|$)/i.test(t.name) && t.callable && t.usable && !t.paid && t.fields.some((f) => f.type === 'string' && !f.options.length)) ?? null
}
// The A2A endpoint an agent card names (https only), kept ten minutes
async function a2aEndpoint(chain, id) {
  const card = await serviceUrl(chain, id, /a2a/i)
  if (!card)
    return null
  const cached = cards.get(card)
  if (cached && Date.now() - cached.at < LIST_TTL)
    return cached.url
  let url = null
  try {
    const response = await publicRequest(card, { headers: { Accept: 'application/json' }, limit: 131072 })
    const doc = response.status === 200 ? JSON.parse(response.text) : null
    url = typeof doc?.url === 'string' && doc.url.startsWith('https://') ? doc.url : null
  }
  catch { }
  cards.set(card, { at: Date.now(), url })
  return url
}
// Text from A2A parts; a reply's own fields when it uses none (some agents answer plain JSON)
function a2aText(result) {
  const parts = (list) => (Array.isArray(list) ? list : []).map((part) => part?.kind === 'text' || typeof part?.text === 'string' ? String(part.text ?? '') : part?.kind === 'data' ? JSON.stringify(part.data, null, 2) : '').filter(Boolean)
  const all = [...parts(result?.parts), ...parts(result?.status?.message?.parts), ...(Array.isArray(result?.artifacts) ? result.artifacts.flatMap((a) => parts(a?.parts)) : [])]
  const body = all.length ? all.join('\n\n') : JSON.stringify(result?.output ?? result ?? '', null, 2)
  const clean = body.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  return clean.length > MAX_RESULT ? `${clean.slice(0, MAX_RESULT)}…` : clean
}
// How a visitor can talk to an agent: by its MCP chat tool, its A2A endpoint, or not at all
export async function talkRoute(chain, id) {
  if (await serviceUrl(chain, id, /mcp/i)) {
    const listing = await agentTools(chain, id)
    const tool = listing.live ? chatTool(listing.tools) : null
    if (tool)
      return { via: 'mcp', listing, tool }
  }
  const endpoint = await a2aEndpoint(chain, id)
  return endpoint ? { via: 'a2a', endpoint } : { via: null }
}
// A reply that is a JSON object with one answer field reads as that answer in a chat
const ANSWER = ['response', 'reply', 'answer', 'message', 'text', 'content', 'output']
export function chatReply(output) {
  try {
    const value = JSON.parse(output)
    const key = value && typeof value === 'object' && !Array.isArray(value) && ANSWER.find((k) => typeof value[k] === 'string')
    return key ? value[key] : output
  }
  catch {
    return output
  }
}
export async function talkToAgent(owner, chain, id, input) {
  const { text: message } = talkSchema.parse(input)
  await rateLimit(`mcp:call:${owner}`, 20)
  await rateLimit('mcp:call:global', 300)
  const route = await talkRoute(chain, id)
  if (route.via === 'mcp') {
    const field = route.tool.fields.find((f) => f.type === 'string' && !f.options.length)
    const answer = await runTool(route.listing, route.tool.name, { [field.name]: message })
    return { via: 'mcp', ...answer, output: chatReply(answer.output) }
  }
  if (route.via !== 'a2a')
    throw new AppError(404, 'notFound')
  try {
    const { reply } = await rpc(route.endpoint, null, { jsonrpc: '2.0', id: ++rpcId, method: 'message/send', params: { message: { kind: 'message', role: 'user', messageId: crypto.randomUUID(), parts: [{ kind: 'text', text: message }] } } }, { timeout: 30000, limit: 524288 })
    const errorText = reply.error ? text(reply.error.message, 300) : ''
    const output = reply.error ? errorText : a2aText(reply.result)
    const paid = paidReply(`${errorText} ${reply.error?.code ?? ''}`)
    return { via: 'a2a', ok: !reply.error, paid, output: paid ? '' : chatReply(output) }
  }
  catch {
    throw new AppError(502, 'mcpUnreachable')
  }
}
