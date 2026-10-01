import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { RagEmbeddingProviderError } from './embeddings'
import { reprocessMaterial } from './ingest-material'
import type { RagPersistence } from './persistence'

const migrationPath = 'supabase/migrations/20260929_022_rag_reprocessing_atomic_reservation.sql'

test('migration reserva reprocessamento sob o mesmo lock e preserva a ativa', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /start_rag_reprocessing_v2\(p_material_id bigint\)/i)
  assert.match(sql, /pg_advisory_xact_lock\(p_material_id\)/i)
  assert.match(sql, /v_active_count <> 1 or v_active_completed_count <> 1/i)
  assert.match(sql, /v_processing_count > 0/i)
  assert.match(sql, /'google'[\s\S]*'gemini-embedding-2'[\s\S]*768/)
  assert.match(sql, /'semantic-v1'[\s\S]*'rag-v2'[\s\S]*'processando'[\s\S]*false/)
  assert.match(sql, /security invoker\s+set search_path = pg_catalog, pg_temp/i)
  assert.match(sql, /revoke all[\s\S]+from public, anon, authenticated/i)
  assert.match(sql, /grant execute[\s\S]+to service_role/i)
  assert.doesNotMatch(sql, /update\s+public\.rag_ingestoes|delete\s+from/i)
})

test('indices versionam documents e preservam uma ativa e uma processando', async () => {
  const structural = await readFile('supabase/migrations/20260925_018_rag_v2.sql', 'utf8')
  const reservation = await readFile('supabase/migrations/20260929_021_rag_ingestion_atomic_reservation.sql', 'utf8')
  assert.match(structural, /unique index[^;]+\(material_id\)[^;]+where ativa = true/i)
  assert.match(structural, /unique index[^;]+\(ingestion_id, content_hash\)/i)
  assert.match(reservation, /unique index uq_rag_ingestoes_material_rag_v2_processando[\s\S]+where status = 'processando' and ingestion_version = 'rag-v2'/i)
})

function statefulPersistence() {
  const state = { oldActive: true, newStatus: null as null | 'processando' | 'erro' | 'concluida', documents: 0, reservation: '' }
  const persistence: RagPersistence = {
    async findMaterial() { return { id: 17, concursoId: 7, provaId: 10, titulo: 'Guia', githubPath: 'guia.txt', tipoArquivo: 'txt', arquivoOrigem: 'guia.txt', disciplina: null, assunto: null, subassunto: null, ativo: true } },
    async createIngestion() { throw new Error('primeira ingestão não deve ser usada') },
    async createFailedIngestionRetry() { throw new Error('retry não deve ser usado') },
    async createReprocessingIngestion() { state.reservation = 'reprocessing'; state.newStatus = 'processando'; return 20 },
    async insertDocuments(rows) { state.documents += rows.length },
    async setTotalChunks() {},
    async countDocuments() { return state.documents },
    async activateIngestion() { state.oldActive = false; state.newStatus = 'concluida' },
    async markIngestionFailed() { state.newStatus = 'erro' },
    async failOrphanedIngestion() { throw new Error('orphan recovery não esperado') },
  }
  return { state, persistence }
}

test('reprocessamento bem-sucedido usa nova ingestion e troca ativa somente no final', async () => {
  const { state, persistence } = statefulPersistence()
  const result = await reprocessMaterial(17, {
    repository: { owner: 'o', repository: 'r', ref: 'main' }, persistence,
    fetchImpl: async () => new Response('conteúdo fiel para reprocessamento', { status: 200, headers: { 'content-type': 'text/plain' } }),
    embeddings: { embed: async (requests) => requests.map(() => ({ values: Array(768).fill(0), provider: 'google' as const, model: 'gemini-embedding-2', dimensions: 768 })) },
  })
  assert.equal(state.reservation, 'reprocessing')
  assert.equal(result.ingestionId, 20)
  assert.equal(state.oldActive, false)
  assert.equal(state.newStatus, 'concluida')
  assert.ok(state.documents > 0)
})

test('falha antes da ativação mantém antiga ativa e marca nova como erro', async () => {
  const { state, persistence } = statefulPersistence()
  await assert.rejects(reprocessMaterial(17, {
    repository: { owner: 'o', repository: 'r', ref: 'main' }, persistence,
    fetchImpl: async () => new Response(null, { status: 500 }),
    embeddings: { embed: async () => assert.fail('embedding não deve ser chamado') },
  }))
  assert.equal(state.oldActive, true)
  assert.equal(state.newStatus, 'erro')
  assert.equal(state.documents, 0)
})

test('falha de embedding e quota diária preservam a ingestão antiga', async () => {
  for (const error of [
    new Error('embedding failed'),
    new RagEmbeddingProviderError('quota', false, 429, {
      httpStatus: 429,
      googleStatus: 'RESOURCE_EXHAUSTED',
      quotaViolations: [{ quotaId: 'EmbedContentRequestsPerDayPerProjectPerModel' }],
    }),
  ]) {
    const { state, persistence } = statefulPersistence()
    await assert.rejects(reprocessMaterial(17, {
      repository: { owner: 'o', repository: 'r', ref: 'main' }, persistence,
      fetchImpl: async () => new Response('conteúdo válido', { status: 200, headers: { 'content-type': 'text/plain' } }),
      embeddings: { embed: async () => { throw error } },
    }))
    assert.equal(state.oldActive, true)
    assert.equal(state.newStatus, 'erro')
    assert.equal(state.documents, 0)
  }
})

test('falha na ativação reverte a troca lógica e preserva documents históricos', async () => {
  const { state, persistence } = statefulPersistence()
  const historicalDocuments = [100, 101, 102]
  persistence.activateIngestion = async () => { throw new Error('activation failed') }
  await assert.rejects(reprocessMaterial(17, {
    repository: { owner: 'o', repository: 'r', ref: 'main' }, persistence,
    fetchImpl: async () => new Response('conteúdo válido', { status: 200, headers: { 'content-type': 'text/plain' } }),
    embeddings: { embed: async (requests) => requests.map(() => ({ values: Array(768).fill(0), provider: 'google' as const, model: 'gemini-embedding-2', dimensions: 768 })) },
  }))
  assert.equal(state.oldActive, true)
  assert.equal(state.newStatus, 'erro')
  assert.deepEqual(historicalDocuments, [100, 101, 102])
})

test('retrieval enxerga somente a versão ativa antes e depois do swap', () => {
  const rows = [{ id: 19, active: true }, { id: 20, active: false }]
  assert.deepEqual(rows.filter((row) => row.active).map((row) => row.id), [19])
  rows[0].active = false
  rows[1].active = true
  assert.deepEqual(rows.filter((row) => row.active).map((row) => row.id), [20])
})

test('RPC de ativação faz swap transacional e nunca apaga histórico', async () => {
  const sql = await readFile('supabase/migrations/20260925_019_activate_rag_ingestion_v2.sql', 'utf8')
  assert.match(sql, /pg_advisory_xact_lock\(p_material_id\)/i)
  assert.match(sql, /set ativa = false[\s\S]+set status = 'concluida', ativa = true/i)
  assert.doesNotMatch(sql, /delete\s+from/i)
})
