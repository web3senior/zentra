import { site } from '@/config/site'
// Shown when signed out. Changes last for the visit only.
export const sampleAgents = site.garden.samples.map((sample, index) => ({
  id: `sample-${index + 1}`, name: sample.name, type: sample.type,
  status: sample.status, currentTask: sample.task, model: 'GPT',
}))
