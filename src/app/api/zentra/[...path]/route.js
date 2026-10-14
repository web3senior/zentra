import { apiState, removeApi, executeApi, rejectApi } from '@/lib/zentra/apiConnections'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticate, assertOrigin, cookieName, logout, ownerFromRequest, realtimeTicket, requestEmailCode, setPublicName, userInfo, verifyEmailCode } from '@/lib/zentra/auth'
import { linkWallet, walletNonce, walletSignIn } from '@/lib/zentra/wallets'
import { blockedBy, directConversations, history, isModerator, markRead, mute, report, setBlock } from '@/lib/zentra/chat'
import { agentSchema } from '@/lib/zentra/schema'
import { AppError, busy, waitingOnOwner, createAgent, getAgent, listAgents, messages, removeAgent, setMemory, updateAgent } from '@/lib/zentra/store'
import { stopRun, talk } from '@/lib/zentra/runtime'
import { providerStatus, removeAimlKey, saveAimlKey } from '@/lib/zentra/providerKeys'
import { cancelJob, eventKey, operations, pauseAgent, receiveEvent, runMission, saveMission } from '@/lib/zentra/queue'
import { decideApproval, deleteFile, ownerFile } from '@/lib/zentra/workspace'
import { saveGithubKey } from '@/lib/zentra/connectors'
import { chainDistricts } from '@/lib/zentra/registry'
import { chainJobs } from '@/lib/zentra/jobs'
import { marketPage } from '@/lib/zentra/market'
import { agentTools, callAgentTool, talkRoute, talkToAgent } from '@/lib/zentra/mcp'
import { musicInfo, removeMusicUpload, saveMusicUpload, streamMusic, streamUpload } from '@/lib/zentra/music'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 100
async function body(request) {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new AppError(415, 'invalid')
  const reader = request.body?.getReader()
  if (!reader)
    throw new AppError(400, 'invalid')
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    size += value.byteLength
    if (size > 65536) {
      await reader.cancel()
      throw new AppError(413, 'invalid')
    }
    chunks.push(value)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  }
  catch {
    throw new AppError(400, 'invalid')
  }
}
const json = (data, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
async function handler(request, context) {
  try {
    const { path } = await context.params
    const route = path.join('/')
    const method = request.method
    if (path[0] === 'events' && path.length === 2 && method === 'POST') {
      const id = z.uuid().parse(path[1])
      const token = request.headers.get('authorization')?.replace(/^Bearer /, '') || ''
      const input = z.object({ eventId: z.string().min(1).max(128), data: z.string().max(4000) }).parse(await body(request))
      return json({ jobId: await receiveEvent(id, token, input.eventId, input.data) }, 202)
    }
    // Public, read-only ERC-8004 agents per chain for the colony's districts
    if (route === 'chains' && method === 'GET')
      return NextResponse.json({ chains: await chainDistricts() }, { headers: { 'Cache-Control': 'public, max-age=60' } })
    // Public, read-only Hup Tasks bounties for the colony's job board
    if (route === 'jobs' && method === 'GET')
      return NextResponse.json({ boards: await chainJobs() }, { headers: { 'Cache-Control': 'public, max-age=60' } })
    // Public, read-only NFT listings from Hup's market, one page at a time
    if (route === 'market' && method === 'GET') {
      const page = await marketPage(Object.fromEntries(new URL(request.url).searchParams))
      if (!page)
        throw new AppError(404, 'notFound')
      return NextResponse.json(page, { headers: { 'Cache-Control': 'public, max-age=60' } })
    }
    // Public: a person's name and, for a Universal Profile, its public LSP3 profile
    if (path[0] === 'people' && path.length === 2 && method === 'GET') {
      const person = await userInfo(z.uuid().parse(path[1]))
      if (!person?.named)
        throw new AppError(404, 'notFound')
      return NextResponse.json({ name: person.username, up: person.up, profile: person.profile }, { headers: { 'Cache-Control': 'public, max-age=60' } })
    }
    if (method !== 'GET')
      assertOrigin(request)
    // A chain agent's MCP tools: listed for anyone, called (free tools only) by a signed-in visitor
    if (path[0] === 'chains' && path[2] === 'agents' && path[4] === 'tools' && path.length === 5) {
      const chain = z.string().max(32).parse(path[1])
      const id = z.coerce.number().int().min(0).parse(path[3])
      if (method === 'GET')
        return json(await agentTools(chain, id))
      if (method === 'POST')
        return json(await callAgentTool(await ownerFromRequest(request), chain, id, await body(request)))
    }
    // Talking to a chain agent: how (its MCP chat tool or A2A), and a message for a signed-in visitor
    if (path[0] === 'chains' && path[2] === 'agents' && path[4] === 'talk' && path.length === 5) {
      const chain = z.string().max(32).parse(path[1])
      const id = z.coerce.number().int().min(0).parse(path[3])
      if (method === 'GET')
        return json({ via: (await talkRoute(chain, id)).via })
      if (method === 'POST')
        return json(await talkToAgent(await ownerFromRequest(request), chain, id, await body(request)))
    }
    // A one-minute ticket for the realtime process when it runs on another host
    if (route === 'realtime/ticket' && method === 'GET')
      return json({ ticket: realtimeTicket(await ownerFromRequest(request)) })
    if (route === 'auth/email/request' && method === 'POST') {
      await requestEmailCode(await body(request))
      return json({ ok: true })
    }
    if (route === 'auth/wallet/nonce' && method === 'POST')
      return json(await walletNonce(await body(request)))
    if (method === 'POST' && ['auth/login', 'auth/register', 'auth/email/verify', 'auth/wallet/verify'].includes(route)) {
      const input = await body(request)
      const token = route === 'auth/email/verify' ? await verifyEmailCode(input) : route === 'auth/wallet/verify' ? await walletSignIn(request, input) : await authenticate(input, route.endsWith('register'))
      const response = json({ ok: true })
      response.cookies.set(cookieName, token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' || new URL(request.url).protocol === 'https:', path: '/', maxAge: 604800 })
      return response
    }
    if (route === 'auth/logout' && method === 'POST') {
      await logout(request)
      const response = json({ ok: true })
      response.cookies.set(cookieName, '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 })
      return response
    }
    if (route === 'wallets/link' && method === 'POST')
      return json(await linkWallet(request, await body(request)))
    const owner = await ownerFromRequest(request)
    // People's chat: history and 1:1 conversations read here; lines are sent over the realtime socket
    if (path[0] === 'chat') {
      if (path[1] === 'rooms' && path.length === 3 && method === 'GET')
        return json(await history(owner, path[2], new URL(request.url).searchParams.get('before')))
      if (route === 'chat/dm' && method === 'GET')
        return json({ conversations: await directConversations(owner) })
      if (route === 'chat/me' && method === 'GET')
        return json({ blocked: [...await blockedBy(owner)], moderator: await isModerator(owner) })
      if (route === 'chat/read' && method === 'POST') {
        const { room, id } = z.object({ room: z.string().max(100), id: z.number().int().positive() }).parse(await body(request))
        await markRead(owner, room, id)
        return json({ ok: true })
      }
      if (route === 'chat/block' && method === 'POST')
        return json(await setBlock(owner, await body(request)))
      if (route === 'chat/report' && method === 'POST') {
        await report(owner, await body(request))
        return json({ ok: true })
      }
      if (route === 'chat/mute' && method === 'POST') {
        await mute(owner, await body(request))
        return json({ ok: true })
      }
    }
    if (route === 'profile/name' && method === 'PUT')
      return json(await setPublicName(owner, await body(request)))
    if (route === 'session' && method === 'GET')
      return json({ ...(await userInfo(owner)), providers: await providerStatus(owner), agents: await listAgents(owner) })
    if (route === 'providers/aimlapi') {
      if (method === 'PUT') {
        const { apiKey } = z.object({ apiKey: z.string().trim().min(10).max(512).regex(/^[\x21-\x7e]+$/) }).parse(await body(request))
        await saveAimlKey(owner, apiKey)
        return json({ providers: await providerStatus(owner) })
      }
      if (method === 'DELETE') {
        await removeAimlKey(owner)
        return json({ providers: await providerStatus(owner) })
      }
    }
    // Live residents for the garden: names and status only, never instructions or memory.
    if (route === 'world' && method === 'GET')
      return json({ user: (await userInfo(owner)).username, agents: await Promise.all((await listAgents(owner)).map(async (agent) => ({ id: agent.id, name: agent.name, model: agent.model, paused: agent.paused, busy: await busy(agent.id), waiting: await waitingOnOwner(agent.id), music: !!agent.musicUrl || !!(await musicInfo(agent.id)) }))) })
    if (route === 'agents' && method === 'POST')
      return json({ agent: await createAgent(owner, agentSchema.parse(await body(request))) }, 201)
    if (path[0] === 'agents' && path[1]) {
      const id = z.uuid().parse(path[1])
      await getAgent(owner, id)
      if (path.length === 2) {
        if (method === 'GET')
          return json({ ...(await getAgent(owner, id)), messages: await messages(owner, id) })
        if (method === 'PATCH') {
          const config = agentSchema.parse(await body(request))
          if (config.paused)
            await pauseAgent(owner, id, true)
          return json({ agent: await updateAgent(owner, id, config) })
        }
        if (method === 'DELETE') {
          await removeAgent(owner, id)
          return json({ ok: true })
        }
      }
      if (path.length === 3) {
        if (path[2] === 'apis') {
          if (method === 'GET')
            return json(await apiState(owner, id))
          if (method === 'DELETE') {
            const input = z.object({ id: z.uuid() }).parse(await body(request))
            await removeApi(owner, id, input.id)
            return json({ ok: true })
          }
        }
        if (path[2] === 'api-approval' && method === 'POST') {
          const input = z.object({ id: z.uuid(), approve: z.boolean(), credential: z.string().min(1).max(512).regex(/^[\x21-\x7e]+$/).optional() }).parse(await body(request))
          if (!input.approve) {
            await rejectApi(owner, id, input.id)
            return json({ ok: true })
          }
          return json(await executeApi(owner, id, input.id, request.signal, undefined, undefined, input.credential))
        }
        // Plot music: an uploaded file (stored in MySQL) wins over a linked one
        if (path[2] === 'music') {
          if (method === 'GET') {
            let music = await streamUpload(id)
            if (!music) {
              const { musicUrl } = (await getAgent(owner, id)).agent
              if (!musicUrl)
                throw new AppError(404, 'invalid')
              music = await streamMusic(musicUrl, request.signal)
            }
            return new Response(music.body, { headers: { 'Content-Type': music.type, 'Cache-Control': 'private, no-cache', ...(music.length ? { 'Content-Length': String(music.length) } : {}) } })
          }
          if (method === 'POST') {
            let name = 'music'
            try {
              name = decodeURIComponent(request.headers.get('x-file-name') || 'music')
            }
            catch { }
            return json({ music: await saveMusicUpload(owner, id, name, request.body) }, 201)
          }
          if (method === 'DELETE') {
            await removeMusicUpload(owner, id)
            return json({ music: null })
          }
        }
        if (path[2] === 'music-info' && method === 'GET')
          return json({ music: await musicInfo(id) })
        if (path[2] === 'operations' && method === 'GET')
          return json(await operations(owner, id))
        if (path[2] === 'mission' && method === 'PUT') {
          await saveMission(owner, id, await body(request))
          return json({ ok: true })
        }
        if (path[2] === 'run' && method === 'POST') {
          const { eventId } = z.object({ eventId: z.uuid() }).parse(await body(request))
          return json({ jobId: await runMission(owner, id, eventId) }, 202)
        }
        if (path[2] === 'event-key' && ['POST', 'DELETE'].includes(method))
          return json({ token: await eventKey(owner, id, method === 'DELETE') })
        if (path[2] === 'pause' && method === 'POST') {
          const { paused } = z.object({ paused: z.boolean() }).parse(await body(request))
          await pauseAgent(owner, id, paused)
          return json({ agent: (await getAgent(owner, id)).agent })
        }
        if (path[2] === 'jobs' && method === 'DELETE') {
          const { jobId } = z.object({ jobId: z.uuid() }).parse(await body(request))
          await cancelJob(owner, id, jobId)
          return json({ ok: true })
        }
        if (path[2] === 'files' && method === 'PUT') {
          await ownerFile(owner, id, await body(request))
          return json({ ok: true })
        }
        if (path[2] === 'files' && method === 'DELETE') {
          const { name } = z.object({ name: z.string().max(100) }).parse(await body(request))
          await deleteFile(owner, id, name)
          return json({ ok: true })
        }
        if (path[2] === 'approvals' && method === 'POST') {
          const input = z.object({ id: z.uuid(), approve: z.boolean() }).parse(await body(request))
          await decideApproval(owner, id, input.id, input.approve)
          return json({ ok: true })
        }
        if (path[2] === 'github' && method === 'PUT') {
          const { token } = z.object({ token: z.string().min(10).max(512).regex(/^[\x21-\x7e]+$/) }).parse(await body(request))
          await saveGithubKey(owner, id, token)
          return json({ ok: true })
        }
        if (path[2] === 'github' && method === 'DELETE') {
          await saveGithubKey(owner, id, null)
          return json({ ok: true })
        }
      }
      if (path[2] === 'memory' && path.length === 3 && method === 'PUT') {
        const { memory } = z.object({ memory: z.string().max(12000) }).parse(await body(request))
        await setMemory(owner, id, memory)
        return json({ ok: true })
      }
      if (path[2] === 'chat' && path.length === 3 && method === 'POST') {
        const input = z.object({ text: z.string().trim().min(1).max(6000), runId: z.uuid() }).parse(await body(request))
        return json(await talk(owner, id, input.runId, input.text, request.signal))
      }
      if (path[2] === 'stop' && path.length === 3 && method === 'POST') {
        await stopRun(owner, id)
        return json({ ok: true })
      }
    }
    throw new AppError(404, 'notFound')
  }
  catch (error) {
    if (error instanceof z.ZodError)
      return json({ error: 'invalid' }, 400)
    if (error instanceof AppError)
      return json({ error: error.code }, error.status)
    return json({ error: 'serverError' }, 500)
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as PUT, handler as DELETE }
