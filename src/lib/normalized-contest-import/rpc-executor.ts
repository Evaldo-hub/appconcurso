import type {
  AtomicNormalizedImportExecutor,
  NormalizedImportPlan,
  NormalizedImportRpcPayload,
  NormalizedImportRpcResult,
} from './types'
import { z } from 'zod'

export const NORMALIZED_IMPORT_RPC = 'importar_concurso_normalizado_atomico'

const nullableText = z.string().nullable()
const nullableOrder = z.number().int().nonnegative().nullable()
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}, 'Data inválida.').nullable()
const payloadSchema = z.object({
  concurso: z.object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    nome: z.string().trim().min(1),
    orgao: z.string().trim().min(1),
    banca: z.string().trim().min(1),
    ano: z.number().int().min(1900).max(2200),
    edital: nullableText,
    data_prova: isoDate,
    descricao: nullableText,
  }).strict(),
  provas: z.array(z.object({
    codigo_prova: z.string().trim().min(1),
    nome: z.string().trim().min(1),
    cargo: nullableText,
    especialidade: nullableText,
    turno: nullableText,
    arquivo_origem: nullableText,
    ativo: z.boolean(),
  }).strict()).min(1),
  conteudos: z.array(z.object({
    disciplina: z.string().trim().min(1),
    assunto: nullableText,
    subassunto: nullableText,
    chave_canonica: z.string().regex(/^[0-9a-f]{64}$/),
    versao_normalizacao: z.literal('canonical-v1'),
    ativo: z.boolean(),
  }).strict().refine((row) => row.subassunto === null || row.assunto !== null, 'Subassunto exige assunto.')).min(1),
  vinculos: z.array(z.object({
    codigo_prova: z.string().trim().min(1),
    chave_canonica: z.string().regex(/^[0-9a-f]{64}$/),
    ativo: z.boolean(),
    disciplina_ordem: nullableOrder,
    assunto_ordem: nullableOrder,
    subassunto_ordem: nullableOrder,
    ordem: nullableOrder,
    origem: z.literal('trt8-2026-manifest-v1'),
  }).strict()).min(1),
  contagens_esperadas: z.object({
    provas: z.number().int().nonnegative(),
    conteudos: z.number().int().nonnegative(),
    vinculos: z.number().int().nonnegative(),
  }).strict(),
}).strict()

export function validateNormalizedImportRpcPayload(payload: NormalizedImportRpcPayload): void {
  payloadSchema.parse(payload)
  if (payload.contagens_esperadas.provas !== payload.provas.length
      || payload.contagens_esperadas.conteudos !== payload.conteudos.length
      || payload.contagens_esperadas.vinculos !== payload.vinculos.length) {
    throw new Error('As contagens esperadas divergem do payload normalizado.')
  }
  if (new Set(payload.provas.map((row) => row.codigo_prova)).size !== payload.provas.length) {
    throw new Error('O payload contém códigos de prova duplicados.')
  }
  if (new Set(payload.conteudos.map((row) => row.chave_canonica)).size !== payload.conteudos.length) {
    throw new Error('O payload contém chaves canônicas duplicadas.')
  }
  const exams = new Set(payload.provas.map((row) => row.codigo_prova))
  const contents = new Set(payload.conteudos.map((row) => row.chave_canonica))
  const links = new Set<string>()
  for (const link of payload.vinculos) {
    if (!exams.has(link.codigo_prova) || !contents.has(link.chave_canonica)) {
      throw new Error('O payload contém vínculo com referência ausente.')
    }
    const identity = `${link.codigo_prova}\0${link.chave_canonica}`
    if (links.has(identity)) throw new Error('O payload contém vínculos duplicados.')
    links.add(identity)
  }
}

export function toNormalizedImportRpcPayload(plan: NormalizedImportPlan): NormalizedImportRpcPayload {
  const payload: NormalizedImportRpcPayload = {
    concurso: { ...plan.contest },
    provas: plan.exams.map((exam) => ({
      codigo_prova: exam.code,
      nome: exam.name,
      cargo: exam.role,
      especialidade: exam.specialty,
      turno: exam.shift,
      arquivo_origem: exam.sourceFile,
      ativo: exam.active,
    })),
    conteudos: plan.catalog.map((content) => ({
      disciplina: content.disciplina,
      assunto: content.assunto,
      subassunto: content.subassunto,
      chave_canonica: content.canonicalKey,
      versao_normalizacao: content.normalizationVersion,
      ativo: content.active,
    })),
    vinculos: plan.links.map((link) => ({
      codigo_prova: link.examCode,
      chave_canonica: link.canonicalKey,
      ativo: link.active,
      disciplina_ordem: link.disciplineOrder,
      assunto_ordem: link.subjectOrder,
      subassunto_ordem: link.subsubjectOrder,
      ordem: link.order,
      origem: link.origin,
    })),
    contagens_esperadas: {
      provas: plan.exams.length,
      conteudos: plan.catalog.length,
      vinculos: plan.links.length,
    },
  }
  validateNormalizedImportRpcPayload(payload)
  return payload
}

export interface NormalizedImportRpcClient {
  rpc(name: typeof NORMALIZED_IMPORT_RPC, args: { p_payload: NormalizedImportRpcPayload }): PromiseLike<{
    data: unknown
    error: { message?: string } | null
  }>
}

function isResult(value: unknown): value is NormalizedImportRpcResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return [
    'concurso_id', 'provas_total', 'provas_inseridas', 'provas_reutilizadas',
    'conteudos_total', 'conteudos_inseridos', 'conteudos_reutilizados',
    'vinculos_total', 'vinculos_inseridos', 'vinculos_reutilizados',
  ].every((key) => typeof row[key] === 'number' && Number.isSafeInteger(row[key]) && (row[key] as number) >= 0)
}

export class SupabaseNormalizedImportExecutor
implements AtomicNormalizedImportExecutor<NormalizedImportRpcResult> {
  constructor(private readonly client: NormalizedImportRpcClient) {}

  async executeAtomically(plan: NormalizedImportPlan): Promise<NormalizedImportRpcResult> {
    const payload = toNormalizedImportRpcPayload(plan)
    const { data, error } = await this.client.rpc(NORMALIZED_IMPORT_RPC, { p_payload: payload })
    if (error) throw new Error(`Importação normalizada recusada: ${error.message ?? 'erro não detalhado'}`)
    if (!isResult(data)) throw new Error('A RPC de importação retornou um resultado inválido.')
    return data
  }
}
