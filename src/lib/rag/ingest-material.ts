import 'server-only'

import { chunkExtractedDocument } from './chunk-text'
import { RAG_CONFIG } from './config'
import { extractMaterialText, type ExtractTextDependencies } from './extract-text'
import { loadMaterialFromGitHub, type GitHubRepositoryConfig } from './github-loader'
import { hashRagContent } from './hash-content'
import { normalizeExtractedDocument } from './normalize-text'
import type { PreparedRagIngestion, RagChunk, RagMaterial } from './types'
import { classifyEmbeddingProviderError, type RagEmbeddingErrorClassification, type RagEmbeddingProviderClient } from './embeddings'
import type { RagPersistence } from './persistence'

export interface PrepareMaterialIngestionDependencies extends ExtractTextDependencies {
  repository: GitHubRepositoryConfig
  fetchImpl?: typeof fetch
}

function validateMaterial(material: RagMaterial) {
  if (!Number.isSafeInteger(material.id) || material.id < 1) throw new Error('Material inválido.')
  if (!Number.isSafeInteger(material.concursoId) || material.concursoId < 1) throw new Error('Concurso do material inválido.')
  if (!material.ativo) throw new Error('O material precisa estar ativo para preparar a ingestão.')
  if (!['pdf', 'txt', 'md'].includes(material.tipoArquivo)) throw new Error('Tipo de material não suportado pelo RAG-V2.')
}

export function finalizeChunks(drafts: ReturnType<typeof chunkExtractedDocument>) {
  const hashes = new Set<string>()
  const chunks: RagChunk[] = []
  let duplicates = 0
  for (const draft of drafts) {
    const contentSha256 = hashRagContent(draft.content)
    if (hashes.has(contentSha256)) {
      duplicates += 1
      continue
    }
    hashes.add(contentSha256)
    chunks.push({ ...draft, index: chunks.length, contentSha256 })
  }
  return { chunks, duplicates }
}

export interface IngestMaterialDependencies extends PrepareMaterialIngestionDependencies {
  embeddings: RagEmbeddingProviderClient
  persistence: RagPersistence
}

export class RagIngestionError extends Error {
  constructor(message: string, readonly classification: RagEmbeddingErrorClassification | null = null) {
    super(message)
    this.name = 'RagIngestionError'
  }
}

export function sanitizeIngestionError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Falha inesperada na ingestão RAG-V2.'
  return message.replace(/[\r\n\t]+/g, ' ').replace(/(?:AIza|ghp_|github_pat_)[A-Za-z0-9_-]+/g, '[segredo removido]').slice(0, 500)
}

export async function ingestMaterial(materialId: number, dependencies: IngestMaterialDependencies) {
  return runMaterialIngestion(materialId, dependencies, (id) => dependencies.persistence.createIngestion(id))
}

export async function retryFailedMaterialIngestion(materialId: number, dependencies: IngestMaterialDependencies) {
  return runMaterialIngestion(materialId, dependencies, (id) => dependencies.persistence.createFailedIngestionRetry(id))
}

export async function reprocessMaterial(materialId: number, dependencies: IngestMaterialDependencies) {
  return runMaterialIngestion(materialId, dependencies, (id) => dependencies.persistence.createReprocessingIngestion(id))
}

async function runMaterialIngestion(
  materialId: number,
  dependencies: IngestMaterialDependencies,
  reserve: (materialId: number) => Promise<number>,
) {
  if (!Number.isSafeInteger(materialId) || materialId < 1) throw new Error('material_id inválido.')
  const material = await dependencies.persistence.findMaterial(materialId)
  if (!material) throw new Error('Material não encontrado.')
  validateMaterial(material)

  let ingestionId: number | null = null
  try {
    ingestionId = await reserve(material.id)
    const prepared = await prepareMaterialIngestion(material, dependencies)
    const embeddings = await dependencies.embeddings.embed(prepared.chunks.map((chunk) => ({
      content: chunk.content,
      title: chunk.title ?? material.titulo,
      taskType: 'RETRIEVAL_DOCUMENT' as const,
    })))
    if (embeddings.length !== prepared.chunks.length) throw new Error('A quantidade de embeddings não corresponde à quantidade de chunks.')

    await dependencies.persistence.insertDocuments(prepared.chunks.map((chunk, index) => ({
      content: chunk.content,
      embedding: embeddings[index].values,
      materialId: material.id,
      concursoId: material.concursoId,
      ingestionId: ingestionId as number,
      contentHash: chunk.contentSha256,
      embeddingProvider: RAG_CONFIG.embedding.provider,
      embeddingModel: RAG_CONFIG.embedding.model,
      embeddingDimensions: RAG_CONFIG.embedding.dimensions,
      ingestionVersion: RAG_CONFIG.ingestionVersion,
      chunkIndex: chunk.index,
      pagina: chunk.page,
      disciplina: material.disciplina,
      assunto: material.assunto,
      subassunto: material.subassunto,
      arquivoOrigem: material.arquivoOrigem,
    })))
    await dependencies.persistence.setTotalChunks(ingestionId, prepared.chunks.length)
    const persistedChunks = await dependencies.persistence.countDocuments(ingestionId)
    if (persistedChunks !== prepared.chunks.length) throw new Error('A validação da ingestão encontrou uma contagem de chunks divergente.')
    await dependencies.persistence.activateIngestion(ingestionId, material.id)

    return {
      materialId: material.id,
      ingestionId,
      status: 'activated' as const,
      totalChunks: prepared.chunks.length,
      embeddedChunks: embeddings.length,
      persistedChunks,
      duplicateChunksRemoved: prepared.duplicateChunksRemoved,
      errors: [],
    }
  } catch (error) {
    const classification = classifyEmbeddingProviderError(error)
    const safeMessage = classification === 'DAILY_QUOTA_EXHAUSTED'
      ? 'DAILY_QUOTA_EXHAUSTED'
      : sanitizeIngestionError(error)
    if (ingestionId !== null) {
      try { await dependencies.persistence.markIngestionFailed(ingestionId, safeMessage) } catch { /* preserve the original sanitized failure */ }
    }
    throw new RagIngestionError(safeMessage, classification)
  }
}

/**
 * Prepara e valida o conteúdo em memória. Não cria rag_ingestao, não gera
 * embeddings e não persiste documents; essas etapas pertencem a uma fase futura.
 */
export async function prepareMaterialIngestion(
  material: RagMaterial,
  dependencies: PrepareMaterialIngestionDependencies,
): Promise<PreparedRagIngestion> {
  validateMaterial(material)
  const file = await loadMaterialFromGitHub(material, dependencies.repository, dependencies.fetchImpl)
  const expectedExtension = file.fileName.split('.').at(-1)?.toLowerCase()
  if (expectedExtension !== material.tipoArquivo) throw new Error('A extensão do arquivo não corresponde ao tipo cadastrado do material.')
  const extracted = await extractMaterialText(file, dependencies)
  const normalized = normalizeExtractedDocument(extracted)
  const { chunks, duplicates } = finalizeChunks(chunkExtractedDocument(normalized))
  if (chunks.length === 0) throw new Error('O material não produziu chunks válidos.')

  return {
    material,
    file: {
      githubPath: file.githubPath,
      fileName: file.fileName,
      contentType: file.contentType,
      size: file.size,
      sourceSha256: file.sourceSha256,
    },
    chunks,
    duplicateChunksRemoved: duplicates,
    ingestionVersion: RAG_CONFIG.ingestionVersion,
    chunkingVersion: RAG_CONFIG.chunkingVersion,
    embedding: RAG_CONFIG.embedding,
    persisted: false,
  }
}
