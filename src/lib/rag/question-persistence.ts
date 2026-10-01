import 'server-only'

import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseRagGeneratedQuestion, validateSourceCitationIntegrity, type RagGeneratedQuestion, type ResolvedGeneratedQuestionSource } from './generated-question'
import type { RagQuestionValidationResult } from './question-validator'

export interface ApprovedRagQuestionPersistenceInput {
  question: RagGeneratedQuestion
  resolvedSources: ResolvedGeneratedQuestionSource[]
  semanticValidation?: RagQuestionValidationResult
  concursoId: number
  provaId: number | null
}

export interface RagQuestionPersistenceResult {
  questaoId: number
  status: 'cadastrada' | 'duplicada'
  fontesInseridas: number
}

export interface RagQuestionPersistenceRpcClient {
  rpc(name: string, parameters: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>
}

export class RagQuestionPersistenceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RagQuestionPersistenceError'
  }
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function normalizeForHash(value: string) {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ')
}

function createQuestionHash(input: ApprovedRagQuestionPersistenceInput) {
  return createHash('sha256').update([
    String(input.concursoId),
    String(input.provaId),
    normalizeForHash(input.question.disciplina).toLowerCase(),
    normalizeForHash(input.question.assunto).toLowerCase(),
    normalizeForHash(input.question.enunciado).toLowerCase(),
  ].join('|'), 'utf8').digest('hex')
}

function precheck(input: ApprovedRagQuestionPersistenceInput) {
  if (!input.semanticValidation) throw new RagQuestionPersistenceError('RAG_PERSISTENCE_VALIDATION_REQUIRED')
  if (input.semanticValidation.finalVerdict !== 'approved') throw new RagQuestionPersistenceError('RAG_PERSISTENCE_VALIDATION_NOT_APPROVED')
  parseRagGeneratedQuestion(input.question)
  if (!validateSourceCitationIntegrity(input.question).valid) throw new RagQuestionPersistenceError('RAG_PERSISTENCE_UNDECLARED_SOURCE_CITATION')
  if (!positiveInteger(input.concursoId)) throw new RagQuestionPersistenceError('RAG_PERSISTENCE_INVALID_CONCURSO')
  if (input.provaId !== null && !positiveInteger(input.provaId)) throw new RagQuestionPersistenceError('RAG_PERSISTENCE_INVALID_PROVA')
  if (input.resolvedSources.length === 0) throw new RagQuestionPersistenceError('RAG_PERSISTENCE_NO_SOURCES')
  const indexes = input.resolvedSources.map((source) => source.sourceIndex)
  if (new Set(indexes).size !== indexes.length) throw new RagQuestionPersistenceError('RAG_PERSISTENCE_DUPLICATE_SOURCE')
  const documentIds = input.resolvedSources.map((source) => source.documentId)
  if (new Set(documentIds).size !== documentIds.length) throw new RagQuestionPersistenceError('RAG_PERSISTENCE_DUPLICATE_DOCUMENT')
  if (
    input.question.sourceIndexes.length !== indexes.length
    || input.question.sourceIndexes.some((index) => !indexes.includes(index))
  ) throw new RagQuestionPersistenceError('RAG_PERSISTENCE_SOURCE_MISMATCH')
  for (const source of input.resolvedSources) {
    if (!positiveInteger(source.documentId)) throw new RagQuestionPersistenceError('RAG_PERSISTENCE_INVALID_DOCUMENT')
    if (!positiveInteger(source.materialId)) throw new RagQuestionPersistenceError('RAG_PERSISTENCE_INVALID_MATERIAL')
    if (!positiveInteger(source.ingestionId)) throw new RagQuestionPersistenceError('RAG_PERSISTENCE_INVALID_INGESTION')
    if (!Number.isSafeInteger(source.chunkIndex) || source.chunkIndex < 0) throw new RagQuestionPersistenceError('RAG_PERSISTENCE_INVALID_CHUNK')
    if (source.pagina !== null && (!Number.isSafeInteger(source.pagina) || source.pagina < 1)) throw new RagQuestionPersistenceError('RAG_PERSISTENCE_INVALID_PAGE')
    if (!Number.isFinite(source.similarity)) throw new RagQuestionPersistenceError('RAG_PERSISTENCE_INVALID_SIMILARITY')
    if (source.concursoId !== input.concursoId || source.provaId !== input.provaId) throw new RagQuestionPersistenceError('RAG_PERSISTENCE_SCOPE_MISMATCH')
  }
}

function parseResult(data: unknown, expectedSources: number): RagQuestionPersistenceResult {
  const candidate = Array.isArray(data) && data.length === 1 ? data[0] : data
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new RagQuestionPersistenceError('RAG_PERSISTENCE_INVALID_RPC_RESULT')
  const row = candidate as Record<string, unknown>
  if (!positiveInteger(row.questao_id) || (row.status !== 'cadastrada' && row.status !== 'duplicada')
    || typeof row.fontes_inseridas !== 'number' || !Number.isSafeInteger(row.fontes_inseridas) || row.fontes_inseridas < 0
    || (row.status === 'duplicada' && row.fontes_inseridas !== 0)
    || (row.status === 'cadastrada' && row.fontes_inseridas !== expectedSources)) {
    throw new RagQuestionPersistenceError('RAG_PERSISTENCE_INVALID_RPC_RESULT')
  }
  return { questaoId: row.questao_id, status: row.status as 'cadastrada' | 'duplicada', fontesInseridas: row.fontes_inseridas }
}

export function createApprovedRagQuestionPersistence(
  rpc: RagQuestionPersistenceRpcClient,
  dependencies: { hash?: (input: ApprovedRagQuestionPersistenceInput) => string } = {},
) {
  return async function persistApprovedRagQuestion(input: ApprovedRagQuestionPersistenceInput): Promise<RagQuestionPersistenceResult> {
    precheck(input)
    const question = input.question
    const hashQuestao = (dependencies.hash ?? createQuestionHash)(input)
    if (!/^[0-9a-f]{64}$/.test(hashQuestao)) throw new RagQuestionPersistenceError('RAG_PERSISTENCE_INVALID_HASH')
    let response: { data: unknown; error: { message?: string } | null }
    try {
      response = await rpc.rpc('persistir_questao_rag_aprovada', {
        p_concurso_id: input.concursoId,
        p_prova_id: input.provaId,
        p_numero_questao: question.numeroQuestao,
        p_disciplina: question.disciplina,
        p_assunto: question.assunto,
        p_subassunto: question.subassunto,
        p_banca: question.banca,
        p_dificuldade: question.dificuldade === 'facil' ? 'Fácil' : question.dificuldade === 'media' ? 'Média' : 'Difícil',
        p_enunciado: question.enunciado,
        p_alternativa_a: question.alternativas.A,
        p_alternativa_b: question.alternativas.B,
        p_alternativa_c: question.alternativas.C,
        p_alternativa_d: question.alternativas.D,
        p_alternativa_e: question.alternativas.E,
        p_gabarito: question.gabarito,
        p_explicacao: question.explicacao,
        p_hash_questao: hashQuestao,
        p_document_ids: input.resolvedSources.map((source) => source.documentId),
      })
    } catch {
      throw new RagQuestionPersistenceError('RAG_PERSISTENCE_RPC_FAILED')
    }
    if (response.error) throw new RagQuestionPersistenceError('RAG_PERSISTENCE_RPC_FAILED')
    return parseResult(response.data, input.resolvedSources.length)
  }
}

export async function persistApprovedRagQuestion(input: ApprovedRagQuestionPersistenceInput) {
  return createApprovedRagQuestionPersistence(createAdminClient())(input)
}
