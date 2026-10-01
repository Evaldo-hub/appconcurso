import 'server-only'

import { estimateTokens } from './chunk-text'
import { retrieveRagContext } from './retrieval'
import type { RagRetrievalInput, RagRetrievalResult } from './types'

export interface RagGenerationSource {
  sourceIndex: number
  documentId: number
  materialId: number
  ingestionId: number
  concursoId: number
  provaId: number | null
  pagina: number | null
  chunkIndex: number
  similarity: number
  arquivoOrigem: string | null
  githubPath: string
  content: string
}

export interface RagGenerationContext {
  query: string
  hasContext: boolean
  contextText: string
  contextCharacters: number
  estimatedTokens: number
  sourceCount: number
  sources: RagGenerationSource[]
  retrieval: {
    provider: 'google'
    model: string
    dimensions: number
    matchCount: number
  }
}

export type RagRetrieveFunction = (input: RagRetrievalInput) => Promise<RagRetrievalResult>

function sourceBlock(match: RagRetrievalResult['matches'][number], sourceIndex: number) {
  return [
    `[FONTE ${sourceIndex}]`,
    `document_id: ${match.documentId}`,
    `material_id: ${match.materialId}`,
    `ingestion_id: ${match.ingestionId}`,
    `concurso_id: ${match.concursoId}`,
    `prova_id: ${match.provaId ?? 'null'}`,
    `pagina: ${match.pagina ?? 'null'}`,
    `chunk_index: ${match.chunkIndex}`,
    `similarity: ${match.similarity}`,
    `arquivo_origem: ${match.arquivoOrigem ?? 'null'}`,
    `github_path: ${match.githubPath}`,
    'conteudo:',
    match.content,
  ].join('\n')
}

export function createRagGenerationContextBuilder(retrieve: RagRetrieveFunction) {
  return async function buildRagGenerationContext(input: RagRetrievalInput): Promise<RagGenerationContext> {
    const result = await retrieve(input)
    const sources = result.matches.map((match, index) => ({
      sourceIndex: index + 1,
      documentId: match.documentId,
      materialId: match.materialId,
      ingestionId: match.ingestionId,
      concursoId: match.concursoId,
      provaId: match.provaId,
      pagina: match.pagina,
      chunkIndex: match.chunkIndex,
      similarity: match.similarity,
      arquivoOrigem: match.arquivoOrigem,
      githubPath: match.githubPath,
      content: match.content,
    }))
    const contextText = result.matches.map((match, index) => sourceBlock(match, index + 1)).join('\n\n')

    return {
      query: result.query,
      hasContext: result.matches.length > 0,
      contextText,
      contextCharacters: contextText.length,
      estimatedTokens: contextText ? estimateTokens(contextText) : 0,
      sourceCount: sources.length,
      sources,
      retrieval: {
        provider: result.provider,
        model: result.model,
        dimensions: result.dimensions,
        matchCount: result.matches.length,
      },
    }
  }
}

export const buildRagGenerationContext = createRagGenerationContextBuilder(retrieveRagContext)
