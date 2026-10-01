import { z } from 'zod'

export const ragIngestionRequestSchema = z.object({
  material_id: z.number().int().positive(),
}).strict()
