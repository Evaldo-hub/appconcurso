import { z } from 'zod'
import type { ContestManifest, ManifestDiscipline } from './types'

const text = (max: number) => z.string().min(1).max(max).refine((value) => value === value.trim(), 'Não use espaços no início ou no fim.')
const order = z.number().int().min(1)
const code = z.string().regex(/^[A-Z0-9][A-Z0-9_-]*$/, 'Use somente A-Z, 0-9, _ ou -.')
const relativePath = z.string().min(1).max(1000).superRefine((value, ctx) => {
  if (value.startsWith('/') || value.startsWith('\\') || /^[A-Za-z]:/.test(value)) ctx.addIssue({ code: 'custom', message: 'O caminho deve ser relativo.' })
  if (value.includes('\\')) ctx.addIssue({ code: 'custom', message: 'Use / como separador.' })
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) ctx.addIssue({ code: 'custom', message: 'URLs não são permitidas.' })
  if (value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) ctx.addIssue({ code: 'custom', message: 'O caminho contém segmento vazio, . ou ...' })
})

const isIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function duplicates<T>(items: T[], value: (item: T) => string | number, base: Array<string | number>, field: string, ctx: z.RefinementCtx) {
  const seen = new Set<string | number>()
  items.forEach((item, index) => { const key = value(item); if (seen.has(key)) ctx.addIssue({ code: 'custom', path: [...base, index, ...(field ? [field] : [])], message: `Valor duplicado: ${String(key)}.` }); seen.add(key) })
}

const subtopicSchema = z.object({ subassunto: text(300), ordem: order, ativo: z.boolean() }).strict()
const subjectSchema = z.object({ assunto: text(300), ordem: order, ativo: z.boolean(), subassuntos: z.array(subtopicSchema).max(500) }).strict().superRefine((value, ctx) => {
  duplicates(value.subassuntos, (item) => item.subassunto, ['subassuntos'], 'subassunto', ctx)
  duplicates(value.subassuntos, (item) => item.ordem, ['subassuntos'], 'ordem', ctx)
})
const disciplineSchema: z.ZodType<ManifestDiscipline> = z.object({ disciplina: text(200), ordem: order, ativo: z.boolean(), assuntos: z.array(subjectSchema).max(1000) }).strict().superRefine((value, ctx) => {
  duplicates(value.assuntos, (item) => item.assunto, ['assuntos'], 'assunto', ctx)
  duplicates(value.assuntos, (item) => item.ordem, ['assuntos'], 'ordem', ctx)
})
const commonSchema = z.object({ codigo: code, nome: text(300), ativo: z.boolean(), disciplinas: z.array(disciplineSchema).min(1).max(500) }).strict().superRefine((value, ctx) => {
  duplicates(value.disciplinas, (item) => item.disciplina, ['disciplinas'], 'disciplina', ctx)
  duplicates(value.disciplinas, (item) => item.ordem, ['disciplinas'], 'ordem', ctx)
})
const examSchema = z.object({ codigo: code, nome: text(300), cargo: text(500), especialidade: text(500).nullable(), turno: text(200).nullable(), arquivo_origem: relativePath.nullable(), ativo: z.boolean(), conteudos_comuns: z.array(code).max(100), conteudo_programatico: z.array(disciplineSchema).max(500) }).strict().superRefine((value, ctx) => {
  duplicates(value.conteudos_comuns, (item) => item, ['conteudos_comuns'], '', ctx)
  duplicates(value.conteudo_programatico, (item) => item.disciplina, ['conteudo_programatico'], 'disciplina', ctx)
  duplicates(value.conteudo_programatico, (item) => item.ordem, ['conteudo_programatico'], 'ordem', ctx)
})
const materialSchema = z.object({
  tipo_fonte: z.enum(['edital', 'retificacao', 'prova', 'gabarito', 'conteudo_programatico', 'material_apoio', 'legislacao', 'outro']),
  tipo_arquivo: z.enum(['pdf', 'docx', 'txt', 'md', 'html']), titulo: text(500), arquivo: relativePath, prova_codigo: code.nullable(), disciplina: text(200).nullable(), assunto: text(300).nullable(), subassunto: text(300).nullable(), ativo: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (value.assunto && !value.disciplina) ctx.addIssue({ code: 'custom', path: ['assunto'], message: 'Assunto exige disciplina.' })
  if (value.subassunto && (!value.disciplina || !value.assunto)) ctx.addIssue({ code: 'custom', path: ['subassunto'], message: 'Subassunto exige disciplina e assunto.' })
  if (!value.prova_codigo && (value.disciplina || value.assunto || value.subassunto)) ctx.addIssue({ code: 'custom', path: ['prova_codigo'], message: 'Material geral não pode informar classificação acadêmica.' })
  if (value.arquivo.split('.').pop()?.toLowerCase() !== value.tipo_arquivo) ctx.addIssue({ code: 'custom', path: ['tipo_arquivo'], message: 'O tipo não corresponde à extensão do arquivo.' })
})

const baseSchema = z.object({ schema_version: z.literal(1), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug inválido.'), nome: text(300), orgao: text(300), banca: text(300), ano: z.number().int().min(1900).max(2200), edital: text(500).nullable(), data_prova: z.string().refine(isIsoDate, 'Data inválida; use YYYY-MM-DD.').nullable(), descricao: text(10000).nullable(), conteudos_comuns: z.array(commonSchema).max(200), provas: z.array(examSchema).min(1).max(1000), materiais: z.array(materialSchema).max(5000) }).strict()

export const contestManifestSchema: z.ZodType<ContestManifest> = baseSchema.superRefine((manifest, ctx) => {
  duplicates(manifest.conteudos_comuns, (item) => item.codigo, ['conteudos_comuns'], 'codigo', ctx)
  duplicates(manifest.provas, (item) => item.codigo, ['provas'], 'codigo', ctx)
  duplicates(manifest.materiais, (item) => item.arquivo, ['materiais'], 'arquivo', ctx)
  const common = new Map(manifest.conteudos_comuns.map((item) => [item.codigo, item]))
  const exams = new Map(manifest.provas.map((item) => [item.codigo, item]))
  const expanded = new Map<string, ManifestDiscipline[]>()
  manifest.provas.forEach((exam, examIndex) => {
    const list: ManifestDiscipline[] = []
    const names = new Set<string>()
    exam.conteudos_comuns.forEach((reference, referenceIndex) => {
      const block = common.get(reference)
      if (!block) return ctx.addIssue({ code: 'custom', path: ['provas', examIndex, 'conteudos_comuns', referenceIndex], message: `Conteúdo comum inexistente: ${reference}.` })
      if (exam.ativo && !block.ativo) ctx.addIssue({ code: 'custom', path: ['provas', examIndex, 'conteudos_comuns', referenceIndex], message: `Prova ativa não pode usar o bloco inativo ${reference}.` })
      block.disciplinas.forEach((discipline) => { if (names.has(discipline.disciplina)) ctx.addIssue({ code: 'custom', path: ['provas', examIndex, 'conteudos_comuns', referenceIndex], message: `Disciplina duplicada após expansão: ${discipline.disciplina}.` }); names.add(discipline.disciplina); list.push(discipline) })
    })
    exam.conteudo_programatico.forEach((discipline, index) => { if (names.has(discipline.disciplina)) ctx.addIssue({ code: 'custom', path: ['provas', examIndex, 'conteudo_programatico', index, 'disciplina'], message: `Disciplina comum repetida no conteúdo específico: ${discipline.disciplina}.` }); names.add(discipline.disciplina); list.push(discipline) })
    expanded.set(exam.codigo, list)
  })
  manifest.materiais.forEach((material, index) => {
    if (!material.prova_codigo) return
    if (!exams.has(material.prova_codigo)) return ctx.addIssue({ code: 'custom', path: ['materiais', index, 'prova_codigo'], message: `Prova inexistente: ${material.prova_codigo}.` })
    if (!material.disciplina) return
    const discipline = expanded.get(material.prova_codigo)?.find((item) => item.disciplina === material.disciplina)
    if (!discipline) return ctx.addIssue({ code: 'custom', path: ['materiais', index, 'disciplina'], message: 'Disciplina não existe no catálogo expandido da prova.' })
    if (!material.assunto) return
    const subject = discipline.assuntos.find((item) => item.assunto === material.assunto)
    if (!subject) return ctx.addIssue({ code: 'custom', path: ['materiais', index, 'assunto'], message: 'Assunto não existe na disciplina informada.' })
    if (material.subassunto && !subject.subassuntos.some((item) => item.subassunto === material.subassunto)) ctx.addIssue({ code: 'custom', path: ['materiais', index, 'subassunto'], message: 'Subassunto não existe no assunto informado.' })
  })
})

export function formatManifestPath(path: PropertyKey[]) { return path.reduce<string>((result, part) => typeof part === 'number' ? `${result}[${part}]` : result ? `${result}.${String(part)}` : String(part), '') || 'manifesto' }
export function parseContestManifestText(source: string) {
  let value: unknown
  try { value = JSON.parse(source) } catch { return { success: false as const, errors: [{ path: 'manifesto', message: 'JSON sintaticamente inválido.' }] } }
  const result = contestManifestSchema.safeParse(value)
  return result.success ? { success: true as const, data: result.data } : { success: false as const, errors: result.error.issues.map((issue) => ({ path: formatManifestPath(issue.path), message: issue.message })) }
}
