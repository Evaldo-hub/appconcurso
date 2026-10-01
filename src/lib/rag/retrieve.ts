import 'server-only'

import { RAG_CONFIG } from './config'
import type { RagRetrievalInput, RagRetrievalResult } from './types'

export interface RagV2Retriever {
  retrieve(input: RagRetrievalInput): Promise<RagRetrievalResult>
}

export function normalizeRetrievalInput(input: RagRetrievalInput): Required<Pick<RagRetrievalInput, 'concursoId' | 'provaId' | 'query' | 'limit' | 'threshold'>> & RagRetrievalInput {
  if (!Number.isSafeInteger(input.concursoId) || input.concursoId < 1) throw new Error('concursoId é obrigatório e deve ser positivo.')
  const provaId = input.provaId ?? null
  if (provaId !== null && (!Number.isSafeInteger(provaId) || provaId < 1)) throw new Error('provaId deve ser positivo ou null.')
  const query = input.query.trim()
  if (!query || query.length > 4_000) throw new Error('A consulta deve ter entre 1 e 4000 caracteres.')
  const limit = input.limit ?? RAG_CONFIG.retrieval.defaultLimit
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > RAG_CONFIG.retrieval.maxLimit) throw new Error(`limit deve estar entre 1 e ${RAG_CONFIG.retrieval.maxLimit}.`)
  const threshold = input.threshold ?? RAG_CONFIG.retrieval.defaultThreshold
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('threshold deve estar entre 0 e 1.')
  return { ...input, provaId, query, limit, threshold }
}

export function createUnconfiguredRagV2Retriever(): RagV2Retriever {
  return {
    async retrieve() {
      throw new Error('A RPC match_documents_rag_v2 ainda não foi implementada.')
    },
  }
}
