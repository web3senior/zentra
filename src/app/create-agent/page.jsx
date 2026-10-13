import AgentWorkbench from '@/components/agents/AgentWorkbench'
import { notFound } from 'next/navigation'
import { site } from '@/config/site'
export const metadata = {
  title: site.agents.create,
  description: site.agents.createIntro,
  robots: { index: false, follow: false },
}
export default function CreateAgentPage() {
  if (!site.features.agents)
    notFound()
  return <AgentWorkbench initiallyCreating/>
}
