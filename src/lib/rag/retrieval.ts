import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { RAG_CONFIG, getRagServerConfig } from './config'
import { createGoogleEmbeddingClient, RagEmbeddingProviderError, type RagEmbeddingProviderClient } from './embeddings'
import { normalizeRetrievalInput } from './retrieve'
import type { RagRetrievalInput, RagRetrievalMatch, RagRetrievalResult } from './types'

interface RagRpcError { message?: string }

export interface RagRetrievalRpcClient {
  rpc(name: string, parameters: Record<string, unknown>): PromiseLike<{ data: unknown; error: RagRpcError | null }>
}

export interface RagRetrievalDependencies {
  embeddings: RagEmbeddingProviderClient
  rpc: RagRetrievalRpcClient
  now?: () => number
}

export class RagRetrievalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RagRetrievalError'
  }
}

export const RAG_CANDIDATE_MULTIPLIER = 4
export const RAG_MAX_CANDIDATE_LIMIT = 50

const DIAGNOSTIC_TEXT_LIMIT = 750

function durationMs(startedAt: number, now: () => number) {
  return Math.max(0, Math.round(now() - startedAt))
}

function safeDiagnosticText(value: unknown, query: string) {
  if (typeof value !== 'string') return undefined
  let sanitized = value
  for (const secret of [process.env.GEMINI_API_KEY, process.env.SUPABASE_SECRET_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY]) {
    if (secret) sanitized = sanitized.replaceAll(secret, '[REDACTED]')
  }
  if (query) sanitized = sanitized.replaceAll(query, '[QUERY_REDACTED]')
  sanitized = sanitized
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED]')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
  return sanitized ? sanitized.slice(0, DIAGNOSTIC_TEXT_LIMIT) : undefined
}

function logEmbeddingError(error: unknown, query: string, duration: number) {
  const providerError = error instanceof RagEmbeddingProviderError ? error : null
  console.error('study_rag_retrieval_error', {
    stage: 'query_embedding',
    error_name: error instanceof Error ? error.name : 'UnknownEmbeddingError',
    message: providerError ? safeDiagnosticText(providerError.message, query) : 'Embedding failure without structured diagnostics.',
    retryable: providerError?.retryable,
    http_status: providerError?.httpStatus,
    google_code: providerError?.diagnostics?.googleCode,
    google_status: safeDiagnosticText(providerError?.diagnostics?.googleStatus, query),
    google_message: safeDiagnosticText(providerError?.diagnostics?.googleMessage, query),
    reason: safeDiagnosticText(providerError?.diagnostics?.reason, query),
    retry_delay: safeDiagnosticText(providerError?.diagnostics?.retryDelay, query),
    retry_after: safeDiagnosticText(providerError?.diagnostics?.retryAfter, query),
    quota_violations: providerError?.diagnostics?.quotaViolations?.map((violation) => ({
      quotaMetric: safeDiagnosticText(violation.quotaMetric, query),
      quotaId: safeDiagnosticText(violation.quotaId, query),
      description: safeDiagnosticText(violation.description, query),
    })),
    duration_ms: duration,
  })
}

function logRpcError(error: unknown, duration: number) {
  console.error('study_rag_retrieval_error', {
    stage: 'match_documents_rpc',
    error_name: error instanceof Error ? error.name : 'RagRpcError',
    message: 'RPC failure without sensitive details.',
    duration_ms: duration,
  })
}

export function ragCandidateLimit(finalLimit: number) {
  return Math.min(finalLimit * RAG_CANDIDATE_MULTIPLIER, RAG_MAX_CANDIDATE_LIMIT)
}

export function selectDiverseRagResults<T extends { documentId: number; materialId: number | null; similarity: number }>(candidates: readonly T[], limit: number): T[] {
  if (!Number.isSafeInteger(limit) || limit < 1) return []
  const byDocument = new Map<number, { match: T; position: number }>()
  candidates.forEach((match, position) => {
    const current = byDocument.get(match.documentId)
    if (!current || match.similarity > current.match.similarity) byDocument.set(match.documentId, { match, position })
  })
  const ranked = [...byDocument.values()]
    .sort((a, b) => b.match.similarity - a.match.similarity || a.position - b.position)
    .map(({ match }) => match)
  const selected: T[] = []
  const selectedDocuments = new Set<number>()
  const representedSources = new Set<string>()
  for (const match of ranked) {
    const sourceKey = match.materialId === null ? `document:${match.documentId}` : `material:${match.materialId}`
    if (representedSources.has(sourceKey)) continue
    representedSources.add(sourceKey)
    selectedDocuments.add(match.documentId)
    selected.push(match)
    if (selected.length === limit) break
  }
  if (selected.length < limit) {
    for (const match of ranked) {
      if (selectedDocuments.has(match.documentId)) continue
      selectedDocuments.add(match.documentId)
      selected.push(match)
      if (selected.length === limit) break
    }
  }
  return selected.sort((a, b) => b.similarity - a.similarity)
}

function positiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function parseRpcRow(value: unknown): RagRetrievalMatch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RagRetrievalError('A RPC RAG-V2 retornou um item inválido.')
  const row = value as Record<string, unknown>
  const valid = positiveInteger(row.document_id)
    && (row.material_id === null || row.material_id === undefined || positiveInteger(row.material_id))
    && positiveInteger(row.ingestion_id)
    && positiveInteger(row.concurso_id)
    && (row.prova_id === null || positiveInteger(row.prova_id))
    && typeof row.content === 'string' && row.content.length > 0
    && typeof row.similarity === 'number' && Number.isFinite(row.similarity)
    && (row.pagina === null || (typeof row.pagina === 'number' && Number.isSafeInteger(row.pagina) && row.pagina > 0))
    && typeof row.chunk_index === 'number' && Number.isSafeInteger(row.chunk_index) && row.chunk_index >= 0
    && nullableString(row.disciplina) && nullableString(row.assunto) && nullableString(row.subassunto)
    && nullableString(row.arquivo_origem)
    && typeof row.github_path === 'string' && row.github_path.length > 0
    && row.embedding_model === RAG_CONFIG.embedding.model
  if (!valid) throw new RagRetrievalError('A RPC RAG-V2 retornou campos essenciais inválidos ou incompatíveis.')
  if (!positiveInteger(row.material_id)) return null

  return {
    documentId: row.document_id as number,
    materialId: row.material_id as number,
    ingestionId: row.ingestion_id as number,
    concursoId: row.concurso_id as number,
    provaId: row.prova_id as number | null,
    content: row.content as string,
    similarity: row.similarity as number,
    pagina: row.pagina as number | null,
    chunkIndex: row.chunk_index as number,
    disciplina: row.disciplina as string | null,
    assunto: row.assunto as string | null,
    subassunto: row.subassunto as string | null,
    arquivoOrigem: row.arquivo_origem as string | null,
    githubPath: row.github_path as string,
    embeddingModel: row.embedding_model as string,
  }
}

export function createRagRetrievalService(dependencies: RagRetrievalDependencies) {
  return async function retrieveRagContext(input: RagRetrievalInput): Promise<RagRetrievalResult> {
    const normalized = normalizeRetrievalInput(input)
    const now = dependencies.now ?? Date.now
    let queryEmbedding
    const embeddingStartedAt = now()
    console.info('study_rag_retrieval', { event: 'query_embedding_started' })
    try {
      const embeddings = await dependencies.embeddings.embed([{ content: normalized.query, taskType: 'RETRIEVAL_QUERY' }])
      if (embeddings.length !== 1) throw new Error('Quantidade inválida.')
      queryEmbedding = embeddings[0]
      console.info('study_rag_retrieval', {
        event: 'query_embedding_finished',
        dimensions: queryEmbedding.dimensions,
        duration_ms: durationMs(embeddingStartedAt, now),
      })
    } catch (error) {
      logEmbeddingError(error, normalized.query, durationMs(embeddingStartedAt, now))
      throw new RagRetrievalError('Falha ao gerar o embedding da consulta RAG-V2.')
    }

    let response: { data: unknown; error: RagRpcError | null }
    const rpcStartedAt = now()
    console.info('study_rag_retrieval', { event: 'rpc_started', rpc: 'match_documents_rag_v2' })
    try {
      response = await dependencies.rpc.rpc('match_documents_rag_v2', {
        p_query_embedding: queryEmbedding.values,
        p_concurso_id: normalized.concursoId,
        p_prova_id: normalized.provaId,
        p_match_count: ragCandidateLimit(normalized.limit),
        p_similarity_threshold: normalized.threshold,
        p_disciplina: normalized.disciplina ?? null,
        p_assunto: normalized.assunto ?? null,
        p_subassunto: normalized.subassunto ?? null,
      })
    } catch (error) {
      logRpcError(error, durationMs(rpcStartedAt, now))
      throw new RagRetrievalError('Falha de infraestrutura ao executar a RPC RAG-V2.')
    }
    if (response.error) {
      logRpcError(response.error, durationMs(rpcStartedAt, now))
      throw new RagRetrievalError('A RPC RAG-V2 retornou erro.')
    }
    if (!Array.isArray(response.data)) {
      logRpcError(new Error('Invalid RPC payload.'), durationMs(rpcStartedAt, now))
      throw new RagRetrievalError('A RPC RAG-V2 retornou um payload inválido.')
    }
    console.info('study_rag_retrieval', {
      event: 'rpc_finished',
      candidate_count: response.data.length,
      duration_ms: durationMs(rpcStartedAt, now),
    })

    const eligibleCandidates = response.data.map(parseRpcRow)
      .filter((match): match is RagRetrievalMatch => match !== null)
      .filter((match) => match.similarity >= normalized.threshold)
    return {
      query: normalized.query,
      matches: selectDiverseRagResults(eligibleCandidates, normalized.limit),
      provider: RAG_CONFIG.embedding.provider,
      model: RAG_CONFIG.embedding.model,
      dimensions: RAG_CONFIG.embedding.dimensions,
    }
  }
}

export async function retrieveRagContext(input: RagRetrievalInput): Promise<RagRetrievalResult> {
  const serverConfig = getRagServerConfig()
  return createRagRetrievalService({
    embeddings: createGoogleEmbeddingClient({ apiKey: serverConfig.geminiApiKey }),
    rpc: createAdminClient(),
  })(input)
}
