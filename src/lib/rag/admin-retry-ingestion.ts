import type { RagAdminMaterial } from './admin-status'

export type RetryRagResult =
  | { status: 'success'; message: 'Nova tentativa de ingestão RAG concluída.' }
  | { status: 'quota'; message: 'Limite diário de embeddings atingido.' }
  | { status: 'error'; message: 'Não foi possível concluir a nova tentativa de ingestão RAG.' }

export type RetryableRagMaterial = {
  id: number
  concursoId: number
  active: boolean
  historyCount: number
  failedRagV2Count: number
  processingRagV2Count: number
  activeCompletedRagV2Count: number
}

export interface RetryRagDependencies {
  findMaterial(materialId: number): Promise<RetryableRagMaterial | null>
  retry(materialId: number): Promise<unknown>
}

export type RagIngestionMode = 'INITIAL' | 'RETRY_FAILED' | 'REPROCESS_ACTIVE' | 'PROCESSING' | 'INELIGIBLE'

export function classifyRagIngestionMode(material: RagAdminMaterial): RagIngestionMode {
  if (!material.active) return 'INELIGIBLE'
  const history = material.ingestionHistory.filter((item) => item.ingestionVersion === 'rag-v2')
  if (history.some((item) => item.status === 'processando')) return 'PROCESSING'
  if (history.some((item) => item.status === 'concluida' && item.active)) return 'REPROCESS_ACTIVE'
  if (history.some((item) => item.status === 'erro' && !item.active)) return 'RETRY_FAILED'
  return history.length === 0 ? 'INITIAL' : 'INELIGIBLE'
}

export function canRetryFailedRagIngestion(material: RagAdminMaterial) {
  return classifyRagIngestionMode(material) === 'RETRY_FAILED'
}

export class RetryRagValidationError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'MATERIAL_NOT_FOUND' | 'MATERIAL_INACTIVE' | 'CROSS_CONTEST' | 'NO_FAILED_HISTORY' | 'PROCESSING_EXISTS' | 'ACTIVE_INGESTION_EXISTS') {
    super(code)
    this.name = 'RetryRagValidationError'
  }
}

export async function executeRetryRag(dependencies: RetryRagDependencies, routeConcursoId: number, materialId: number) {
  if (!Number.isSafeInteger(routeConcursoId) || routeConcursoId < 1 || !Number.isSafeInteger(materialId) || materialId < 1) {
    throw new RetryRagValidationError('INVALID_INPUT')
  }
  const material = await dependencies.findMaterial(materialId)
  if (!material) throw new RetryRagValidationError('MATERIAL_NOT_FOUND')
  if (!material.active) throw new RetryRagValidationError('MATERIAL_INACTIVE')
  if (material.concursoId !== routeConcursoId) throw new RetryRagValidationError('CROSS_CONTEST')
  if (material.processingRagV2Count > 0) throw new RetryRagValidationError('PROCESSING_EXISTS')
  if (material.activeCompletedRagV2Count > 0) throw new RetryRagValidationError('ACTIVE_INGESTION_EXISTS')
  if (material.historyCount === 0 || material.failedRagV2Count === 0) throw new RetryRagValidationError('NO_FAILED_HISTORY')
  return dependencies.retry(material.id)
}

export function successfulRetryRag(): RetryRagResult {
  return { status: 'success', message: 'Nova tentativa de ingestão RAG concluída.' }
}

export function failedRetryRag(error: unknown): RetryRagResult {
  if (error instanceof Error && 'classification' in error && error.classification === 'DAILY_QUOTA_EXHAUSTED') {
    return { status: 'quota', message: 'Limite diário de embeddings atingido.' }
  }
  return { status: 'error', message: 'Não foi possível concluir a nova tentativa de ingestão RAG.' }
}
