import { z } from 'zod'

import type { ContestManifest, ManifestDiscipline } from '@/lib/contest-manifest/types'

const normalizedText = (max: number) => z.string().min(1).max(max).refine((value) => value === value.trim(), 'Texto com espaços externos.')
const nullableText = (max: number) => normalizedText(max).nullable()
const order = z.number().int().positive()

const subsubjectSchema = z.object({ nome: normalizedText(300), ordem: order }).strict()
const subjectSchema = z.object({
  nome: normalizedText(300),
  ordem: order,
  subassuntos: z.array(subsubjectSchema).max(1000),
}).strict()
const disciplineSchema = z.object({
  nome: normalizedText(200),
  ordem: order,
  assuntos: z.array(subjectSchema).max(2000),
}).strict()
const examSchema = z.object({
  codigo_prova: normalizedText(100),
  cargo: normalizedText(500),
  especialidade: nullableText(500),
  escolaridade: nullableText(300),
  turno: nullableText(200),
  disciplinas: z.array(disciplineSchema).min(1).max(1000),
}).strict()
const materialSchema = z.object({
  tipo_fonte: normalizedText(100),
  tipo_arquivo: normalizedText(50),
  titulo: normalizedText(500),
  arquivo: normalizedText(1000),
  prova_codigo: nullableText(100),
  disciplina: nullableText(200),
  assunto: nullableText(300),
  subassunto: nullableText(300),
  ativo: z.boolean(),
}).strict()

const sourceSchema = z.object({
  schema_version: z.literal('1.0'),
  concurso_id: z.number().int().positive(),
  slug: z.literal('trt8-2026'),
  nome: z.literal('TRT8 - CONCURSO 2026'),
  orgao: z.literal('TRT8'),
  banca: z.literal('Fundação Carlos Chagas - FCC'),
  ano: z.literal(2026),
  edital: z.literal('Edital Nº 01/2026 de Abertura de Inscrições'),
  data_prova: z.literal('17/01/2027'),
  descricao: nullableText(10000),
  conteudos_comuns: z.array(normalizedText(200)).max(100),
  provas: z.array(examSchema).min(1).max(1000),
  materiais: z.array(materialSchema).max(5000),
}).strict().superRefine((source, ctx) => {
  const proofCodes = new Set<string>()
  source.provas.forEach((exam, examIndex) => {
    if (proofCodes.has(exam.codigo_prova)) ctx.addIssue({ code: 'custom', path: ['provas', examIndex, 'codigo_prova'], message: 'Código de prova duplicado.' })
    proofCodes.add(exam.codigo_prova)
    const disciplineNames = new Set<string>()
    exam.disciplinas.forEach((discipline, disciplineIndex) => {
      if (disciplineNames.has(discipline.nome)) ctx.addIssue({ code: 'custom', path: ['provas', examIndex, 'disciplinas', disciplineIndex, 'nome'], message: 'Disciplina duplicada na prova.' })
      disciplineNames.add(discipline.nome)
    })
  })
})

export type Trt82026Source = z.infer<typeof sourceSchema>

function toManifestDiscipline(source: Trt82026Source['provas'][number]['disciplinas'][number]): ManifestDiscipline {
  return {
    disciplina: source.nome,
    ordem: source.ordem,
    ativo: true,
    assuntos: source.assuntos.map((subject) => ({
      assunto: subject.nome,
      ordem: subject.ordem,
      ativo: true,
      subassuntos: subject.subassuntos.map((subsubject) => ({ subassunto: subsubject.nome, ordem: subsubject.ordem, ativo: true })),
    })),
  }
}

export function parseTrt82026SourceText(sourceText: string) {
  let raw: unknown
  try {
    raw = JSON.parse(sourceText)
  } catch {
    return { success: false as const, errors: [{ path: 'manifesto', message: 'JSON sintaticamente inválido.' }] }
  }
  const parsed = sourceSchema.safeParse(raw)
  if (!parsed.success) return {
    success: false as const,
    errors: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  }

  const data = parsed.data
  const manifest: ContestManifest = {
    schema_version: 1,
    slug: data.slug,
    nome: data.nome,
    orgao: data.orgao,
    banca: data.banca,
    ano: data.ano,
    edital: data.edital,
    data_prova: '2027-01-17',
    descricao: data.descricao,
    conteudos_comuns: [],
    provas: data.provas.map((exam) => ({
      codigo: exam.codigo_prova,
      nome: `${exam.cargo}${exam.especialidade ? ` - ${exam.especialidade}` : ''}`,
      cargo: exam.cargo,
      especialidade: exam.especialidade,
      turno: exam.turno,
      arquivo_origem: null,
      ativo: true,
      conteudos_comuns: [],
      conteudo_programatico: exam.disciplinas.map(toManifestDiscipline),
    })),
    materiais: [],
  }
  return {
    success: true as const,
    source: data,
    manifest,
    legacyContestId: data.concurso_id,
    declaredCommonBlocks: data.conteudos_comuns,
    examSchooling: new Map(data.provas.map((exam) => [exam.codigo_prova, exam.escolaridade])),
  }
}
