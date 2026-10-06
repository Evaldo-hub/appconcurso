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
  rpc(name: string, parameters: Record<string, unknown>): PromiseLike<{
    data: unknown
    error: { code?: string; message?: string; details?: string; hint?: string } | null
  }>
}

export type RagQuestionPersistenceStage = 'precheck' | 'rpc_transport' | 'rpc_response' | 'rpc_result'

export class RagQuestionPersistenceError extends Error {
  constructor(
    message: string,
    readonly diagnostics: {
      stage: RagQuestionPersistenceStage
      databaseCode?: string
      databaseMessage?: string
      databaseDetails?: string
      databaseHint?: string
    } = { stage: 'precheck' },
  ) {
    super(message)
    this.name = 'RagQuestionPersistenceError'
  }
}

const DIAGNOSTIC_TEXT_LIMIT = 500

function safeDiagnosticText(value: unknown) {
  if (typeof value !== 'string') return undefined
  let sanitized = value
  for (const secret of [process.env.SUPABASE_SECRET_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY]) {
    if (secret) sanitized = sanitized.replaceAll(secret, '[REDACTED]')
  }
  sanitized = sanitized
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/sb_secret_[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
  return sanitized ? sanitized.slice(0, DIAGNOSTIC_TEXT_LIMIT) : undefined
}

export function logRagQuestionPersistenceFailure(
  error: unknown,
  context: { concursoId: number; provaId: number | null; sourceCount: number; sourceProofIds: Array<number | null> },
) {
  const persistenceError = error instanceof RagQuestionPersistenceError ? error : null
  const uniqueProofIds = [...new Set(context.sourceProofIds)]
  console.error('study_rag_persistence', {
    event: 'persistence_failed',
    rpc: 'persistir_questao_rag_aprovada',
    stage: persistenceError?.diagnostics.stage ?? 'unknown',
    error_name: error instanceof Error ? error.name : 'UnknownPersistenceError',
    error_code: persistenceError?.message ?? 'RAG_PERSISTENCE_UNKNOWN_FAILURE',
    database_code: safeDiagnosticText(persistenceError?.diagnostics.databaseCode),
    database_message: safeDiagnosticText(persistenceError?.diagnostics.databaseMessage),
    database_details: safeDiagnosticText(persistenceError?.diagnostics.databaseDetails),
    database_hint: safeDiagnosticText(persistenceError?.diagnostics.databaseHint),
    concurso_id: context.concursoId,
    prova_id: context.provaId,
    source_count: context.sourceCount,
    source_proof_scope: uniqueProofIds.every((id) => id === null)
      ? 'general'
      : uniqueProofIds.every((id) => id === context.provaId)
        ? 'specific'
        : 'mixed',
  })
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
    const sourceMatchesProofScope = input.provaId === null
      ? source.provaId === null
      : source.provaId === null || source.provaId === input.provaId
    if (source.concursoId !== input.concursoId || !sourceMatchesProofScope) throw new RagQuestionPersistenceError('RAG_PERSISTENCE_SCOPE_MISMATCH')
  }
}

function parseResult(data: unknown, expectedSources: number): RagQuestionPersistenceResult {
  const candidate = Array.isArray(data) && data.length === 1 ? data[0] : data
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new RagQuestionPersistenceError('RAG_PERSISTENCE_INVALID_RPC_RESULT', { stage: 'rpc_result' })
  const row = candidate as Record<string, unknown>
  if (!positiveInteger(row.questao_id) || (row.status !== 'cadastrada' && row.status !== 'duplicada')
    || typeof row.fontes_inseridas !== 'number' || !Number.isSafeInteger(row.fontes_inseridas) || row.fontes_inseridas < 0
    || (row.status === 'duplicada' && row.fontes_inseridas !== 0)
    || (row.status === 'cadastrada' && row.fontes_inseridas !== expectedSources)) {
    throw new RagQuestionPersistenceError('RAG_PERSISTENCE_INVALID_RPC_RESULT', { stage: 'rpc_result' })
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
    let response: { data: unknown; error: { code?: string; message?: string; details?: string; hint?: string } | null }
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
      throw new RagQuestionPersistenceError('RAG_PERSISTENCE_RPC_FAILED', { stage: 'rpc_transport' })
    }
    if (response.error) throw new RagQuestionPersistenceError('RAG_PERSISTENCE_RPC_FAILED', {
      stage: 'rpc_response',
      databaseCode: response.error.code,
      databaseMessage: response.error.message,
      databaseDetails: response.error.details,
      databaseHint: response.error.hint,
    })
    return parseResult(response.data, input.resolvedSources.length)
  }
}

export async function persistApprovedRagQuestion(input: ApprovedRagQuestionPersistenceInput) {
  return createApprovedRagQuestionPersistence(createAdminClient())(input)
}
