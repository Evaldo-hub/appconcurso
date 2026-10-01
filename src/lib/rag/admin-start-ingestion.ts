import type { RagAdminMaterial } from './admin-status'

export type StartRagIngestionResult =
  | { status: 'success'; message: 'Ingestão RAG concluída.' }
  | { status: 'quota'; message: 'Limite diário de embeddings atingido.' }
  | { status: 'error'; message: 'Não foi possível concluir a ingestão RAG.' }

export type StartRagMaterial = {
  id: number
  concursoId: number
  active: boolean
  hasRagV2History: boolean
}

export interface StartRagIngestionDependencies {
  findMaterial(materialId: number): Promise<StartRagMaterial | null>
  ingest(materialId: number): Promise<unknown>
}

export function successfulStartRagIngestion(): StartRagIngestionResult {
  return { status: 'success', message: 'Ingestão RAG concluída.' }
}

export function failedStartRagIngestion(error: unknown): StartRagIngestionResult {
  if (error instanceof Error && 'classification' in error && error.classification === 'DAILY_QUOTA_EXHAUSTED') {
    return { status: 'quota', message: 'Limite diário de embeddings atingido.' }
  }
  return { status: 'error', message: 'Não foi possível concluir a ingestão RAG.' }
}

export class StartRagIngestionValidationError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'MATERIAL_NOT_FOUND' | 'MATERIAL_INACTIVE' | 'CROSS_CONTEST' | 'INITIAL_INGESTION_NOT_ALLOWED') {
    super(code)
    this.name = 'StartRagIngestionValidationError'
  }
}

export function canStartInitialRagIngestion(material: RagAdminMaterial) {
  return material.active
    && material.ragStatus === 'PENDING'
    && !material.ingestionHistory.some((ingestion) => ingestion.ingestionVersion === 'rag-v2')
}

export async function executeStartRagIngestion(
  dependencies: StartRagIngestionDependencies,
  routeConcursoId: number,
  materialId: number,
) {
  if (!Number.isSafeInteger(routeConcursoId) || routeConcursoId < 1 || !Number.isSafeInteger(materialId) || materialId < 1) {
    throw new StartRagIngestionValidationError('INVALID_INPUT')
  }
  const material = await dependencies.findMaterial(materialId)
  if (!material) throw new StartRagIngestionValidationError('MATERIAL_NOT_FOUND')
  if (!material.active) throw new StartRagIngestionValidationError('MATERIAL_INACTIVE')
  if (material.concursoId !== routeConcursoId) throw new StartRagIngestionValidationError('CROSS_CONTEST')
  if (material.hasRagV2History) throw new StartRagIngestionValidationError('INITIAL_INGESTION_NOT_ALLOWED')
  return dependencies.ingest(material.id)
}
