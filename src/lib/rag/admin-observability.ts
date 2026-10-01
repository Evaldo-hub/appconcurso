import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildRagAdminSnapshot, countActiveRagDocuments, type RagDocumentAdminRow, type RagIngestionAdminRow, type RagMaterialAdminRow } from './admin-status'

interface ExamRow { id: number; nome: string }

export class RagAdminObservabilityError extends Error {
  constructor() { super('Não foi possível consultar o status dos materiais RAG.'); this.name = 'RagAdminObservabilityError' }
}

export async function loadRagAdminSnapshot(admin: SupabaseClient, concursoId: number) {
  if (!Number.isSafeInteger(concursoId) || concursoId < 1) throw new RagAdminObservabilityError()
  const [materialsResult, examsResult] = await Promise.all([
    admin.from('materiais_concurso').select('id,titulo,tipo_arquivo,tipo_fonte,github_path,concurso_id,prova_id,ativo').eq('concurso_id', concursoId).order('id'),
    admin.from('provas').select('id,nome').eq('concurso_id', concursoId),
  ])
  if (materialsResult.error || examsResult.error) throw new RagAdminObservabilityError()
  const materials = (materialsResult.data ?? []) as RagMaterialAdminRow[]
  if (materials.length === 0) return buildRagAdminSnapshot([], [], new Map())

  const materialIds = materials.map((material) => material.id)
  const ingestionResult = await admin.from('rag_ingestoes')
    .select('id,material_id,status,ativa,total_chunks,erro,embedding_provider,embedding_model,embedding_dimensions,ingestion_version,chunking_version,iniciado_em,concluido_em,created_at')
    .in('material_id', materialIds).order('id', { ascending: false })
  if (ingestionResult.error) throw new RagAdminObservabilityError()
  const ingestions = (ingestionResult.data ?? []) as RagIngestionAdminRow[]
  const activeIds = ingestions.filter((item) => item.ativa && item.status === 'concluida' && item.ingestion_version === 'rag-v2').map((item) => item.id)
  let counts = new Map<number, number>()
  if (activeIds.length > 0) {
    const documentsResult = await admin.from('documents').select('ingestion_id,ingestion_version').in('ingestion_id', activeIds)
    if (documentsResult.error) throw new RagAdminObservabilityError()
    counts = countActiveRagDocuments((documentsResult.data ?? []) as RagDocumentAdminRow[], activeIds)
  }
  const provaLabels = new Map(((examsResult.data ?? []) as ExamRow[]).map((exam) => [exam.id, exam.nome]))
  return buildRagAdminSnapshot(materials, ingestions, counts, provaLabels)
}
