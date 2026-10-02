export type RagEmbeddingProvider = 'google'
export type RagSupportedFileType = 'pdf' | 'txt' | 'md'
export const RAG_DOCUMENT_CATEGORIES = [
  'EDITAL',
  'NORMA_OFICIAL',
  'MANUAL_OFICIAL',
  'DOCUMENTACAO_TECNICA_OFICIAL',
  'PROVA_ANTERIOR',
  'MATERIAL_EXPLICATIVO',
  'OUTRO',
] as const
export type RagDocumentCategory = typeof RAG_DOCUMENT_CATEGORIES[number]
export type RagQueryIntent = 'CERTAME' | 'CONHECIMENTO'

export interface RagMaterial {
  id: number
  concursoId: number
  provaId: number | null
  titulo: string
  githubPath: string
  tipoArquivo: RagSupportedFileType
  arquivoOrigem: string | null
  disciplina: string | null
  assunto: string | null
  subassunto: string | null
  ativo: boolean
}

export interface RagEmbeddingConfig {
  provider: RagEmbeddingProvider
  model: string
  dimensions: number
  batchSize: number
  timeoutMs: number
}

export interface LoadedMaterialFile {
  bytes: Uint8Array
  githubPath: string
  fileName: string
  contentType: string | null
  size: number
  sourceSha256?: string
}

export interface ExtractedTextSection {
  content: string
  page: number | null
  title: string | null
  section: string | null
}

export interface ExtractedDocument {
  fileName: string
  fileType: RagSupportedFileType
  title: string | null
  sections: ExtractedTextSection[]
}

export interface RagChunk {
  index: number
  content: string
  contentSha256: string
  estimatedTokens: number
  page: number | null
  title: string | null
  section: string | null
}

export interface RagEmbeddingRequest {
  content: string
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'
  title?: string
}

export interface RagEmbedding {
  values: number[]
  provider: RagEmbeddingProvider
  model: string
  dimensions: number
}

export interface PreparedRagIngestion {
  material: RagMaterial
  file: Omit<LoadedMaterialFile, 'bytes'>
  chunks: RagChunk[]
  duplicateChunksRemoved: number
  ingestionVersion: string
  chunkingVersion: string
  embedding: RagEmbeddingConfig
  persisted: false
}

export interface RagIngestionResult {
  materialId: number
  ingestionId: number | null
  status: 'prepared' | 'persisted' | 'validated' | 'activated' | 'failed'
  totalChunks: number
  embeddedChunks: number
  persistedChunks: number
  duplicateChunksRemoved: number
  errors: string[]
}

export interface RagDocumentInsert {
  content: string
  embedding: number[]
  materialId: number
  concursoId: number
  ingestionId: number
  contentHash: string
  embeddingProvider: RagEmbeddingProvider
  embeddingModel: string
  embeddingDimensions: number
  ingestionVersion: string
  chunkIndex: number
  pagina: number | null
  disciplina: string | null
  assunto: string | null
  subassunto: string | null
  arquivoOrigem: string | null
}

export interface RagRetrievalInput {
  concursoId: number
  provaId?: number | null
  query: string
  disciplina?: string | null
  assunto?: string | null
  subassunto?: string | null
  limit?: number
  threshold?: number
}

export interface RagRetrievalMatch {
  documentId: number
  materialId: number
  ingestionId: number
  concursoId: number
  provaId: number | null
  content: string
  similarity: number
  arquivoOrigem: string | null
  githubPath: string
  pagina: number | null
  chunkIndex: number
  disciplina: string | null
  assunto: string | null
  subassunto: string | null
  embeddingModel: string
  documentCategory?: RagDocumentCategory
  categoryPriority?: number
}

export interface RagRetrievalResult {
  query: string
  matches: RagRetrievalMatch[]
  provider: RagEmbeddingProvider
  model: string
  dimensions: number
}
