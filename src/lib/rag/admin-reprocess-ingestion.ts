import type { RagAdminMaterial } from './admin-status'

export type ReprocessRagResult =
  | { status: 'success'; message: 'Reprocessamento RAG concluído.' }
  | { status: 'quota'; message: 'Limite diário de embeddings atingido.' }
  | { status: 'error'; message: 'Não foi possível concluir o reprocessamento RAG.' }

export type ReprocessableRagMaterial = {
  id: number
  concursoId: number
  active: boolean
  activeRagV2Count: number
  activeCompletedRagV2Count: number
  processingRagV2Count: number
}

export interface ReprocessRagDependencies {
  findMaterial(materialId: number): Promise<ReprocessableRagMaterial | null>
  reprocess(materialId: number): Promise<unknown>
}

export type ReprocessingEligibility = 'eligible' | 'processing' | 'ineligible'

export function getReprocessingEligibility(material: RagAdminMaterial): ReprocessingEligibility {
  if (!material.active || material.ragStatus !== 'READY') return 'ineligible'
  const activeRagV2 = material.ingestionHistory.filter((ingestion) =>
    ingestion.ingestionVersion === 'rag-v2' && ingestion.active)
  const activeCompleted = material.ingestionHistory.filter((ingestion) =>
    ingestion.ingestionVersion === 'rag-v2' && ingestion.active && ingestion.status === 'concluida')
  if (activeRagV2.length !== 1 || activeCompleted.length !== 1) return 'ineligible'
  return material.ingestionHistory.some((ingestion) =>
    ingestion.ingestionVersion === 'rag-v2' && ingestion.status === 'processando')
    ? 'processing'
    : 'eligible'
}

export function successfulReprocessRag(): ReprocessRagResult {
  return { status: 'success', message: 'Reprocessamento RAG concluído.' }
}

export function failedReprocessRag(error: unknown): ReprocessRagResult {
  if (error instanceof Error && 'classification' in error && error.classification === 'DAILY_QUOTA_EXHAUSTED') {
    return { status: 'quota', message: 'Limite diário de embeddings atingido.' }
  }
  return { status: 'error', message: 'Não foi possível concluir o reprocessamento RAG.' }
}

export class ReprocessRagValidationError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'MATERIAL_NOT_FOUND' | 'MATERIAL_INACTIVE' | 'CROSS_CONTEST' | 'REPROCESSING_NOT_ALLOWED' | 'REPROCESSING_IN_PROGRESS') {
    super(code)
    this.name = 'ReprocessRagValidationError'
  }
}

export async function executeReprocessRag(
  dependencies: ReprocessRagDependencies,
  routeConcursoId: number,
  materialId: number,
) {
  if (!Number.isSafeInteger(routeConcursoId) || routeConcursoId < 1 || !Number.isSafeInteger(materialId) || materialId < 1) {
    throw new ReprocessRagValidationError('INVALID_INPUT')
  }
  const material = await dependencies.findMaterial(materialId)
  if (!material) throw new ReprocessRagValidationError('MATERIAL_NOT_FOUND')
  if (!material.active) throw new ReprocessRagValidationError('MATERIAL_INACTIVE')
  if (material.concursoId !== routeConcursoId) throw new ReprocessRagValidationError('CROSS_CONTEST')
  if (material.processingRagV2Count > 0) throw new ReprocessRagValidationError('REPROCESSING_IN_PROGRESS')
  if (material.activeRagV2Count !== 1 || material.activeCompletedRagV2Count !== 1) {
    throw new ReprocessRagValidationError('REPROCESSING_NOT_ALLOWED')
  }
  return dependencies.reprocess(material.id)
}
