import { z } from 'zod'

const text = (max: number) => z.string().trim().min(1, 'Campo obrigatório.').max(max)
const nullableText = (max: number) => text(max).nullable()
const order = z.number().int().min(1)

function duplicateIssues<T>(items: T[], selectors: Array<[string, (item: T) => string | number]>, ctx: z.RefinementCtx, prefix: Array<string | number> = []) {
  for (const [field, selector] of selectors) {
    const seen = new Set<string | number>()
    items.forEach((item, index) => {
      const value = selector(item)
      if (seen.has(value)) ctx.addIssue({ code: 'custom', path: [...prefix, index, field], message: `Valor duplicado: ${String(value)}.` })
      seen.add(value)
    })
  }
}

const subtopicSchema = z.object({ nome: text(300), ordem: order }).strict()
const subjectSchema = z.object({ nome: text(300), ordem: order, subassuntos: z.array(subtopicSchema).max(1000) }).strict().superRefine((value, ctx) => {
  duplicateIssues(value.subassuntos, [['nome', (item) => item.nome], ['ordem', (item) => item.ordem]], ctx)
})
const disciplineSchema = z.object({ nome: text(200), ordem: order, assuntos: z.array(subjectSchema).max(5000) }).strict().superRefine((value, ctx) => {
  duplicateIssues(value.assuntos, [['nome', (item) => item.nome], ['ordem', (item) => item.ordem]], ctx)
})
const examSchema = z.object({
  codigo_prova: z.string().trim().min(1).max(100),
  cargo: text(500),
  especialidade: nullableText(500),
  escolaridade: nullableText(200).optional(),
  turno: nullableText(200).optional(),
  disciplinas: z.array(disciplineSchema).min(1).max(1000),
}).strict().superRefine((value, ctx) => {
  duplicateIssues(value.disciplinas, [['nome', (item) => item.nome], ['ordem', (item) => item.ordem]], ctx)
})

export const contestFileSchema = z.object({
  concurso_id: z.number().int().positive().safe('concurso_id deve ser um inteiro seguro do JavaScript.').nullable().optional(),
  nome: text(300), orgao: text(300), banca: text(300), ano: z.number().int().min(1900).max(2200),
  edital: nullableText(500), escopo: nullableText(100).optional(), observacao: nullableText(2000).optional(),
}).strict()

export const programFileSchema = z.object({
  schema_version: z.literal('1.0', { errorMap: () => ({ message: 'Versão não suportada; use 1.0.' }) }),
  concurso_id: z.number().int().positive().safe('concurso_id deve ser um inteiro seguro do JavaScript.').nullable().optional(),
  provas: z.array(examSchema).min(1, 'Informe ao menos uma prova.').max(5000),
}).strict().superRefine((value, ctx) => duplicateIssues(value.provas, [['codigo_prova', (item) => item.codigo_prova]], ctx, ['provas']))

function formatPath(path: PropertyKey[], root: string) {
  return path.reduce<string>((result, part) => typeof part === 'number' ? `${result}[${part}]` : `${result}.${String(part)}`, root)
}

export function parseJsonFile<T>(source: string, schema: z.ZodType<T>, root: string) {
  let value: unknown
  try { value = JSON.parse(source) } catch { return { success: false as const, errors: [{ path: root, message: 'JSON sintaticamente inválido.' }] } }
  const result = schema.safeParse(value)
  return result.success
    ? { success: true as const, data: result.data }
    : { success: false as const, errors: result.error.issues.map((issue) => ({ path: formatPath(issue.path, root), message: issue.message })) }
}

export const parseContestFileText = (source: string) => parseJsonFile(source, contestFileSchema, 'concurso')
export const parseProgramFileText = (source: string) => parseJsonFile(source, programFileSchema, 'conteudo_programatico')
