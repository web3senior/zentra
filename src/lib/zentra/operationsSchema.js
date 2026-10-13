import { z } from 'zod'
export const fileSchema = z.object({
  name: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9 _.-]*\.(txt|md|json|csv)$/i),
  content: z.string().max(40000).refine(value => !value.includes('\0')),
})
export const missionSchema = z.object({
  prompt: z.string().trim().max(4000).default(''),
  enabled: z.boolean().default(false),
  intervalMinutes: z.number().int().min(15).max(10080).default(60),
  maxRetries: z.number().int().min(0).max(3).default(1),
  eventsEnabled: z.boolean().default(false),
}).refine(value => (!value.enabled && !value.eventsEnabled) || value.prompt.length > 0, { path: ['prompt'] })
