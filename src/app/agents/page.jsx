import AgentWorkbench from '@/components/agents/AgentWorkbench'
import { notFound } from 'next/navigation'
import { site } from '@/config/site'
export const metadata = { title: site.agents.title, robots: { index: false, follow: false } }
export default function AgentsPage() {
  if (!site.features.agents)
    notFound()
  return <AgentWorkbench />
}
