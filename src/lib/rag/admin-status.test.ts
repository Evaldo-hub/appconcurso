import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRagAdminSnapshot,
  countActiveRagDocuments,
  deriveRagMaterialStatus,
  type RagAdminIngestion,
  type RagIngestionAdminRow,
  type RagMaterialAdminRow,
} from './admin-status'

function ingestion(overrides: Partial<RagAdminIngestion> = {}): RagAdminIngestion {
  return {
    ingestionId: 1,
    status: 'erro',
    active: false,
    totalChunks: 0,
    documentCount: 0,
    error: null,
    embeddingProvider: 'google',
    embeddingModel: 'gemini-embedding-2',
    embeddingDimensions: 768,
    ingestionVersion: 'rag-v2',
    chunkingVersion: 'semantic-v1',
    startedAt: '2026-09-28T10:00:00Z',
    concludedAt: null,
    createdAt: '2026-09-28T10:00:00Z',
    ...overrides,
  }
}

test('deriva os estados administrativos deterministicamente', () => {
  assert.equal(deriveRagMaterialStatus([ingestion({ status: 'concluida', active: true })]), 'READY')
  assert.equal(deriveRagMaterialStatus([]), 'PENDING')
  assert.equal(deriveRagMaterialStatus([ingestion({ status: 'processando' })]), 'PROCESSING')
  assert.equal(deriveRagMaterialStatus([ingestion({ error: 'HTTP 429 genérico' })]), 'ERROR')
  assert.equal(deriveRagMaterialStatus([ingestion({ error: 'DAILY_QUOTA_EXHAUSTED: limite diário' })]), 'DAILY_QUOTA_BLOCKED')
})

test('conta somente documents rag-v2 pertencentes a ingestões ativas selecionadas', () => {
  const counts = countActiveRagDocuments([
    { ingestion_id: 2, ingestion_version: 'rag-v2' },
    { ingestion_id: 2, ingestion_version: 'rag-v2' },
    { ingestion_id: 2, ingestion_version: null },
    { ingestion_id: 3, ingestion_version: 'rag-v2' },
    { ingestion_id: null, ingestion_version: null },
  ], [2])
  assert.deepEqual([...counts], [[2, 2]])
})

test('resume materiais, erros e contagens da ingestão ativa', () => {
  const materials: RagMaterialAdminRow[] = [1, 2, 3, 4, 5].map((id) => ({
    id, titulo: `Material ${id}`, tipo_arquivo: 'pdf', tipo_fonte: 'arquivo', github_path: `arquivo-${id}.pdf`,
    concurso_id: 7, prova_id: null, ativo: true,
  }))
  const base: Omit<RagIngestionAdminRow, 'id' | 'material_id' | 'status' | 'ativa' | 'total_chunks' | 'erro'> = {
    embedding_provider: 'google', embedding_model: 'gemini-embedding-2', embedding_dimensions: 768,
    ingestion_version: 'rag-v2', chunking_version: 'semantic-v1', iniciado_em: '2026-09-28T10:00:00Z',
    concluido_em: null, created_at: '2026-09-28T10:00:00Z',
  }
  const ingestions: RagIngestionAdminRow[] = [
    { ...base, id: 10, material_id: 1, status: 'concluida', ativa: true, total_chunks: 100, erro: null },
    { ...base, id: 11, material_id: 2, status: 'erro', ativa: false, total_chunks: 0, erro: 'DAILY_QUOTA_EXHAUSTED' },
    { ...base, id: 12, material_id: 4, status: 'processando', ativa: false, total_chunks: 0, erro: null },
    { ...base, id: 13, material_id: 5, status: 'erro', ativa: false, total_chunks: 0, erro: 'falha definitiva' },
  ]
  const snapshot = buildRagAdminSnapshot(materials, ingestions, new Map([[10, 99]]))
  assert.deepEqual(snapshot.summary, {
    totalMaterials: 5, ready: 1, pending: 1, error: 2, quotaBlocked: 1, processing: 1,
    activeChunks: 100, activeDocuments: 99,
  })
})
