'use client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, RequestError } from '@/components/agents/clientApi'
import { site } from '@/config/site'
import { sessionQuery } from '@/components/Profile'
import Garden from './Garden'
import GardenChat from './GardenChat'
const copy = site.garden
const resident = (r) => ({
  id: r.id,
  name: r.name,
  type: 'general',
  model: r.model,
  music: r.music ? `/api/zentra/agents/${r.id}/music` : undefined,
  // thinking draws the ? bubble: the agent needs its owner
  status: r.paused ? 'sleeping' : r.busy ? 'working' : r.waiting ? 'thinking' : 'idle',
  currentTask: r.paused ? copy.paused : r.busy ? copy.working : r.waiting ? copy.approval : copy.waiting,
})
// Chain agents stand as residents: ready if their registration says active, otherwise asleep
const district = (chain) => ({
  ...chain,
  records: chain.agents,
  agents: chain.agents.map((a) => ({
    id: `${chain.id}:${a.id}`,
    name: a.name,
    type: 'general',
    model: `ERC-8004 #${a.id}`,
    status: a.active ? 'idle' : 'sleeping',
    currentTask: a.active ? copy.chain.active : copy.chain.inactive,
  })),
})
// Signed in: the owner's real agents, polled for status. Signed out: the sample garden.
// Both show every chain district, read from the public registry index. With agent hosting off
// (site.features.agents) everyone sees the sample colony, read-only, and a signed-in visitor walks
// under their own name.
export default function GardenHome() {
  const queryClient = useQueryClient()
  const session = useQuery({ ...sessionQuery, enabled: !site.features.agents })
  const world = useQuery({
    queryKey: ['garden-world'],
    queryFn: ({ signal }) => api('world', 'GET', undefined, signal),
    enabled: site.features.agents,
    refetchInterval: (query) => (query.state.error ? false : 10_000),
    retry: (count, error) => !(error instanceof RequestError && error.status === 401) && count < 1,
  })
  const chains = useQuery({
    queryKey: ['garden-chains'],
    queryFn: ({ signal }) => api('chains', 'GET', undefined, signal),
    refetchInterval: 300_000,
    select: (data) => data.chains.map(district),
  })
  const districts = chains.data
  const jobs = useQuery({
    queryKey: ['garden-jobs'],
    queryFn: ({ signal }) => api('jobs', 'GET', undefined, signal),
    refetchInterval: 300_000,
    select: (data) => data.boards,
  })
  const boards = jobs.data
  // Hup's NFT market: the first page of listings gives the stall its count
  const market = useQuery({
    queryKey: ['garden-market'],
    queryFn: ({ signal }) => api('market', 'GET', undefined, signal),
    refetchInterval: 300_000,
    select: (data) => ({ count: data.items.length, more: data.more }),
  }).data
  if (!site.features.agents)
    return (
      <Garden
        readOnly
        visitor={session.data?.named ? session.data.username : undefined}
        visitorUp={!!session.data?.up}
        signedIn={!!session.data}
        sessionKey={session.data ? `${session.data.username}:${session.data.named}` : ''}
        districts={districts}
        boards={boards} market={market}
      />
    )
  if (world.isPending) return <Garden live agents={[]} districts={districts} boards={boards} market={market} />
  if (world.data) {
    const agents = world.data.agents.map(resident)
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ['garden-world'] })
    return (
      <Garden
        live
        visitor={world.data.user}
        agents={agents}
        districts={districts}
        boards={boards} market={market}
        panel={(agent) => <GardenChat key={agent.id} agentId={agent.id} onActivity={refresh} />}
        notice={agents.length ? undefined : { text: copy.empty, href: `${site.agents.path}?create=1`, label: copy.createFirst }}
      />
    )
  }
  const signedOut = world.error instanceof RequestError && world.error.status === 401
  return (
    <Garden
      districts={districts}
      boards={boards} market={market}
      notice={signedOut ? { text: '', href: site.agents.path, label: copy.signIn } : undefined}
    />
  )
}
