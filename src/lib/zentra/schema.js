import { z } from 'zod'
export const agentSchema = z.object({
  name: z.string().trim().min(1).max(60),
  instructions: z.string().trim().min(1).max(6000),
  provider: z.enum(['openai', 'aimlapi']).default('openai'),
  model: z.string().trim().min(1).max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9/_.:-]*$/).default('gpt-4.1-mini'),
  memoryEnabled: z.boolean().default(true),
  filesEnabled: z.boolean().default(true),
  fileWriteMode: z.enum(['deny', 'ask', 'allow']).default('ask'),
  webHosts: z.array(z.string().trim().toLowerCase().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/)).max(10).default([]),
  githubRepos: z.array(z.string().trim().toLowerCase().max(150).regex(/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/)).max(10).default([]),
  paused: z.boolean().default(false),
  dailyRuns: z.number().int().min(1).max(100).default(20),
  maxTurns: z.number().int().min(1).max(5).default(3),
  maxOutputTokens: z.number().int().min(128).max(2048).default(1024),
  // Plot music: empty, an https audio file or an IPFS upload (ipfs://CID[/path]); loops in the colony
  musicUrl: z.string().trim().max(500).regex(/^(|https:\/\/[^\s"<>]+|ipfs:\/\/[A-Za-z0-9]{20,100}(\/[^\s"<>]*)?)$/).default(''),
}).refine(value => value.provider !== 'openai' || value.model === 'gpt-4.1-mini', { path: ['model'], message: 'Unsupported OpenAI model' })
// A public name: shown to everyone in the colony and chat
export const publicNameSchema = z.object({ name: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,32}$/) })
export const emailSchema = z.object({ email: z.string().trim().toLowerCase().max(254).pipe(z.email()) })
export const emailCodeSchema = emailSchema.extend({ code: z.string().trim().regex(/^\d{6}$/), invite: z.string().max(256).optional() })
export const credentialsSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,32}$/),
  password: z.string().min(12).max(128),
  invite: z.string().max(256).optional(),
})
