import { z } from 'zod'
export const apiConnectionSchema = z.object({
  name: z.string().trim().min(1).max(60),
  url: z.string().url().max(1000),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  instructions: z.string().trim().min(1).max(4000),
  auth: z.enum(['none', 'bearer', 'x-api-key']),
  secret: z.string().min(1).max(512).regex(/^[\x21-\x7e]+$/).optional(),
  autoRead: z.boolean().default(false),
}).refine(v => v.auth === 'none' || !!v.secret, { path: ['secret'] })
