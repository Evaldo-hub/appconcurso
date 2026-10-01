export type RagAdminMaterialStatus = 'READY' | 'PENDING' | 'ERROR' | 'DAILY_QUOTA_BLOCKED' | 'PROCESSING'

export interface RagAdminIngestion {
  ingestionId: number
  status: string
  active: boolean
  totalChunks: number
  documentCount: number
  error: string | null
  embeddingProvider: string
  embeddingModel: string
  embeddingDimensions: number
  ingestionVersion: string
  chunkingVersion: string
  startedAt: string
  concludedAt: string | null
  createdAt: string
}

export interface RagAdminMaterial {
  materialId: number
  title: string
  fileType: string | null
  sourceType: string | null
  githubPath: string
  concursoId: number
  provaId: number | null
  provaLabel: string | null
  active: boolean
  ragStatus: RagAdminMaterialStatus
  activeIngestion: RagAdminIngestion | null
  ingestionHistory: RagAdminIngestion[]
}

export interface RagAdminSummary {
  totalMaterials: number
  ready: number
  pending: number
  error: number
  quotaBlocked: number
  processing: number
  activeChunks: number
  activeDocuments: number
}

export interface RagAdminSnapshot { summary: RagAdminSummary; materials: RagAdminMaterial[] }

export interface RagMaterialAdminRow {
  id: number; titulo: string; tipo_arquivo: string | null; tipo_fonte: string | null; github_path: string | null
  concurso_id: number; prova_id: number | null; ativo: boolean
}
export interface RagIngestionAdminRow {
  id: number; material_id: number; status: string; ativa: boolean; total_chunks: number; erro: string | null
  embedding_provider: string; embedding_model: string; embedding_dimensions: number; ingestion_version: string
  chunking_version: string; iniciado_em: string; concluido_em: string | null; created_at: string
}
export interface RagDocumentAdminRow { ingestion_id: number | null; ingestion_version: string | null }

export function countActiveRagDocuments(
  documents: readonly RagDocumentAdminRow[],
  activeIngestionIds: readonly number[],
): Map<number, number> {
  const activeIds = new Set(activeIngestionIds)
  const counts = new Map<number, number>()
  for (const document of documents) {
    if (document.ingestion_id === null || document.ingestion_version !== 'rag-v2' || !activeIds.has(document.ingestion_id)) continue
    counts.set(document.ingestion_id, (counts.get(document.ingestion_id) ?? 0) + 1)
  }
  return counts
}

export function deriveRagMaterialStatus(history: readonly RagAdminIngestion[]): RagAdminMaterialStatus {
  const activeCompleted = history.filter((item) => item.active && item.status === 'concluida')
  if (activeCompleted.length === 1) return 'READY'
  const latest = history[0]
  if (!latest) return 'PENDING'
  if (latest.status === 'processando') return 'PROCESSING'
  if (latest.error?.includes('DAILY_QUOTA_EXHAUSTED')) return 'DAILY_QUOTA_BLOCKED'
  return 'ERROR'
}

export function buildRagAdminSnapshot(
  materials: readonly RagMaterialAdminRow[],
  ingestions: readonly RagIngestionAdminRow[],
  documentCounts: ReadonlyMap<number, number>,
  provaLabels: ReadonlyMap<number, string> = new Map(),
): RagAdminSnapshot {
  const result = materials.map((material): RagAdminMaterial => {
    const history = ingestions.filter((item) => item.material_id === material.id)
      .sort((left, right) => right.id - left.id)
      .map((item): RagAdminIngestion => ({
        ingestionId: item.id, status: item.status, active: item.ativa, totalChunks: item.total_chunks,
        documentCount: documentCounts.get(item.id) ?? 0, error: item.erro,
        embeddingProvider: item.embedding_provider, embeddingModel: item.embedding_model,
        embeddingDimensions: item.embedding_dimensions, ingestionVersion: item.ingestion_version,
        chunkingVersion: item.chunking_version, startedAt: item.iniciado_em,
        concludedAt: item.concluido_em, createdAt: item.created_at,
      }))
    const ragStatus = deriveRagMaterialStatus(history)
    return {
      materialId: material.id, title: material.titulo, fileType: material.tipo_arquivo,
      sourceType: material.tipo_fonte, githubPath: material.github_path ?? '', concursoId: material.concurso_id,
      provaId: material.prova_id, provaLabel: material.prova_id === null ? null : provaLabels.get(material.prova_id) ?? null,
      active: material.ativo, ragStatus,
      activeIngestion: history.find((item) => item.active && item.status === 'concluida') ?? null,
      ingestionHistory: history,
    }
  })
  const ready = result.filter((item) => item.ragStatus === 'READY')
  return {
    summary: {
      totalMaterials: result.length, ready: ready.length,
      pending: result.filter((item) => item.ragStatus === 'PENDING').length,
      error: result.filter((item) => item.ragStatus === 'ERROR' || item.ragStatus === 'DAILY_QUOTA_BLOCKED').length,
      quotaBlocked: result.filter((item) => item.ragStatus === 'DAILY_QUOTA_BLOCKED').length,
      processing: result.filter((item) => item.ragStatus === 'PROCESSING').length,
      activeChunks: ready.reduce((total, item) => total + (item.activeIngestion?.totalChunks ?? 0), 0),
      activeDocuments: ready.reduce((total, item) => total + (item.activeIngestion?.documentCount ?? 0), 0),
    },
    materials: result,
  }
}
