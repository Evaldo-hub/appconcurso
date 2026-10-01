import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { RAG_CONFIG } from './config'
import type { RagDocumentInsert, RagMaterial, RagSupportedFileType } from './types'

type MaterialRow = {
  id: number
  concurso_id: number
  prova_id: number | null
  titulo: string
  github_path: string | null
  tipo_arquivo: string | null
  arquivo_origem: string | null
  disciplina: string | null
  assunto: string | null
  subassunto: string | null
  ativo: boolean
}

export interface RagPersistence {
  findMaterial(materialId: number): Promise<RagMaterial | null>
  createIngestion(materialId: number): Promise<number>
  createFailedIngestionRetry(materialId: number): Promise<number>
  createReprocessingIngestion(materialId: number): Promise<number>
  insertDocuments(documents: readonly RagDocumentInsert[]): Promise<void>
  setTotalChunks(ingestionId: number, totalChunks: number): Promise<void>
  countDocuments(ingestionId: number): Promise<number>
  activateIngestion(ingestionId: number, materialId: number): Promise<void>
  markIngestionFailed(ingestionId: number, error: string): Promise<void>
  failOrphanedIngestion(ingestionId: number, reason: 'ORPHANED_INGESTION_EXECUTOR_TERMINATED'): Promise<void>
}

function databaseError(operation: string) {
  return new Error(`Falha ao ${operation} no armazenamento RAG-V2.`)
}

function mapMaterial(row: MaterialRow): RagMaterial {
  if (!row.github_path || !row.tipo_arquivo || !['pdf', 'txt', 'md'].includes(row.tipo_arquivo)) {
    throw new Error('O material não possui arquivo GitHub compatível com o RAG-V2.')
  }
  return {
    id: row.id,
    concursoId: row.concurso_id,
    provaId: row.prova_id,
    titulo: row.titulo,
    githubPath: row.github_path,
    tipoArquivo: row.tipo_arquivo as RagSupportedFileType,
    arquivoOrigem: row.arquivo_origem,
    disciplina: row.disciplina,
    assunto: row.assunto,
    subassunto: row.subassunto,
    ativo: row.ativo,
  }
}

export function createSupabaseRagPersistence(admin: SupabaseClient): RagPersistence {
  return {
    async findMaterial(materialId) {
      const { data, error } = await admin.from('materiais_concurso')
        .select('id, concurso_id, prova_id, titulo, github_path, tipo_arquivo, arquivo_origem, disciplina, assunto, subassunto, ativo')
        .eq('id', materialId)
        .maybeSingle<MaterialRow>()
      if (error) throw databaseError('consultar o material')
      return data ? mapMaterial(data) : null
    },

    async createIngestion(materialId) {
      const { data, error } = await admin.rpc('start_rag_ingestion_v2', {
        p_material_id: materialId,
      }).single<{ ingestion_id: number }>()
      if (error || !data) throw databaseError('criar a ingestão')
      return data.ingestion_id
    },

    async createFailedIngestionRetry(materialId) {
      const { data, error } = await admin.rpc('start_rag_ingestion_retry_v2', {
        p_material_id: materialId,
      }).single<{ ingestion_id: number }>()
      if (error || !data) throw databaseError('reservar a nova tentativa de ingestão')
      return data.ingestion_id
    },

    async createReprocessingIngestion(materialId) {
      const { data, error } = await admin.rpc('start_rag_reprocessing_v2', {
        p_material_id: materialId,
      }).single<{ ingestion_id: number }>()
      if (error || !data) throw databaseError('reservar o reprocessamento')
      return data.ingestion_id
    },

    async insertDocuments(documents) {
      for (let offset = 0; offset < documents.length; offset += RAG_CONFIG.persistence.insertBatchSize) {
        const batch = documents.slice(offset, offset + RAG_CONFIG.persistence.insertBatchSize).map((item) => ({
          content: item.content,
          embedding: item.embedding,
          material_id: item.materialId,
          concurso_id: item.concursoId,
          ingestion_id: item.ingestionId,
          content_hash: item.contentHash,
          embedding_provider: item.embeddingProvider,
          embedding_model: item.embeddingModel,
          embedding_dimensions: item.embeddingDimensions,
          ingestion_version: item.ingestionVersion,
          chunk_index: item.chunkIndex,
          pagina: item.pagina,
          disciplina: item.disciplina,
          assunto: item.assunto,
          subassunto: item.subassunto,
          arquivo_origem: item.arquivoOrigem,
        }))
        const { error } = await admin.from('documents').insert(batch)
        if (error) throw databaseError('gravar os chunks')
      }
    },

    async setTotalChunks(ingestionId, totalChunks) {
      const { data, error } = await admin.from('rag_ingestoes').update({ total_chunks: totalChunks })
        .eq('id', ingestionId).eq('status', 'processando').eq('ativa', false).select('id')
      if (error || data?.length !== 1) throw databaseError('registrar o total de chunks')
    },

    async countDocuments(ingestionId) {
      const { count, error } = await admin.from('documents').select('id', { count: 'exact', head: true }).eq('ingestion_id', ingestionId)
      if (error || count === null) throw databaseError('validar os chunks gravados')
      return count
    },

    async activateIngestion(ingestionId, materialId) {
      const { error } = await admin.rpc('activate_rag_ingestion_v2', { p_ingestion_id: ingestionId, p_material_id: materialId })
      if (error) throw databaseError('ativar atomicamente a ingestão')
    },

    async markIngestionFailed(ingestionId, message) {
      const { error } = await admin.from('rag_ingestoes').update({ status: 'erro', ativa: false, erro: message, concluido_em: new Date().toISOString() })
        .eq('id', ingestionId).eq('ativa', false)
      if (error) throw databaseError('registrar a falha da ingestão')
    },

    async failOrphanedIngestion(ingestionId, reason) {
      const { error } = await admin.rpc('fail_orphaned_rag_ingestion_v2', {
        p_ingestion_id: ingestionId,
        p_reason: reason,
      })
      if (error) throw databaseError('registrar a ingestão órfã')
    },
  }
}
