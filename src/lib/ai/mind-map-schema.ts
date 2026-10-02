import { z } from 'zod'

const htmlPattern = /<\/?[a-z][^>]*>/i

const safeText = (minimum: number, maximum: number) => z.string()
  .trim()
  .min(minimum)
  .max(maximum)
  .refine((value) => !htmlPattern.test(value), 'HTML não é permitido.')

export const mindMapIconSchema = z.enum([
  'target',
  'book',
  'brain',
  'workflow',
  'layers',
  'building',
  'scale',
  'list',
  'check',
  'alert',
  'lightbulb',
])

export const mindMapItemSchema = z.object({
  titulo: safeText(1, 100),
  descricao: safeText(1, 300),
}).strict()

export const mindMapBranchSchema = z.object({
  titulo: safeText(1, 100),
  icone: mindMapIconSchema.catch('brain'),
  itens: z.array(mindMapItemSchema).min(1).max(8),
}).strict()

export const mindMapSchema = z.object({
  titulo: safeText(1, 150),
  descricao: safeText(1, 300),
  ramos: z.array(mindMapBranchSchema).min(2).max(8),
  memorizar: z.array(safeText(1, 250)).min(3).max(7),
}).strict()

export type MindMap = z.infer<typeof mindMapSchema>

export function parseMindMapContent(content: string): MindMap | null {
  try {
    const parsed = JSON.parse(content) as unknown
    const result = mindMapSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}
