import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { canRetryFailedRagIngestion, classifyRagIngestionMode, executeRetryRag, RetryRagValidationError } from './admin-retry-ingestion'
import type { RagAdminIngestion, RagAdminMaterial } from './admin-status'
import { retryFailedMaterialIngestion } from './ingest-material'
import type { RagPersistence } from './persistence'

const migrationPath = 'supabase/migrations/20260930_024_add_failed_rag_ingestion_retry.sql'

function ingestion(status: string, active = false, id = 1): RagAdminIngestion {
  return { ingestionId: id, status, active, totalChunks: 0, documentCount: 0, error: status === 'erro' ? 'falha' : null,
    embeddingProvider: 'google', embeddingModel: 'gemini-embedding-2', embeddingDimensions: 768,
    ingestionVersion: 'rag-v2', chunkingVersion: 'semantic-v1', startedAt: '', concludedAt: null, createdAt: '' }
}

function material(history: RagAdminIngestion[], active = true): RagAdminMaterial {
  return { materialId: 8, title: 'Material', fileType: 'txt', sourceType: 'arquivo', githubPath: 'safe/file.txt',
    concursoId: 7, provaId: null, provaLabel: null, active, ragStatus: history.length ? 'ERROR' : 'PENDING',
    activeIngestion: history.find((item) => item.active && item.status === 'concluida') ?? null, ingestionHistory: history }
}

test('migration define reserva atômica, segura e sem alterar histórico', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /start_rag_ingestion_retry_v2\(p_material_id bigint\)/i)
  assert.match(sql, /pg_advisory_xact_lock\(p_material_id\)/i)
  for (const error of ['RAG_RETRY_MATERIAL_NOT_FOUND', 'RAG_RETRY_MATERIAL_INACTIVE', 'RAG_RETRY_NO_FAILED_HISTORY', 'RAG_RETRY_PROCESSING_EXISTS', 'RAG_RETRY_ACTIVE_INGESTION_EXISTS']) assert.match(sql, new RegExp(error))
  assert.match(sql, /security invoker\s+set search_path = pg_catalog, pg_temp/i)
  assert.match(sql, /revoke all[\s\S]+from public, anon, authenticated/i)
  assert.match(sql, /grant execute[\s\S]+to service_role/i)
  assert.match(sql, /'google'[\s\S]*'gemini-embedding-2'[\s\S]*768[\s\S]*'semantic-v1'[\s\S]*'rag-v2'/i)
  assert.doesNotMatch(sql, /\b(update|delete|truncate|alter table)\b/i)
})

test('concorrência combina advisory lock com índice único de processando por material', async () => {
  const retrySql = await readFile(migrationPath, 'utf8')
  const initialSql = await readFile('supabase/migrations/20260929_021_rag_ingestion_atomic_reservation.sql', 'utf8')
  assert.match(retrySql, /pg_advisory_xact_lock\(p_material_id\)/i)
  assert.match(initialSql, /unique index uq_rag_ingestoes_material_rag_v2_processando[\s\S]+where status = 'processando' and ingestion_version = 'rag-v2'/i)
})

test('classificador separa INITIAL, RETRY_FAILED e REPROCESS_ACTIVE', () => {
  assert.equal(classifyRagIngestionMode(material([])), 'INITIAL')
  assert.equal(classifyRagIngestionMode(material([ingestion('erro')])), 'RETRY_FAILED')
  assert.equal(classifyRagIngestionMode(material([ingestion('concluida', true)])), 'REPROCESS_ACTIVE')
  assert.equal(classifyRagIngestionMode(material([ingestion('erro'), ingestion('processando', false, 2)])), 'PROCESSING')
  assert.equal(classifyRagIngestionMode(material([ingestion('erro')], false)), 'INELIGIBLE')
  assert.equal(canRetryFailedRagIngestion(material([ingestion('erro')])), true)
})

test('orquestrador rejeita estados que não são RETRY_FAILED', async () => {
  let calls = 0
  const run = (found: Awaited<ReturnType<Parameters<typeof executeRetryRag>[0]['findMaterial']>>) => executeRetryRag({
    findMaterial: async () => found, retry: async () => { calls += 1 },
  }, 7, 8)
  const cases = [
    [null, 'MATERIAL_NOT_FOUND'],
    [{ id: 8, concursoId: 7, active: false, historyCount: 1, failedRagV2Count: 1, processingRagV2Count: 0, activeCompletedRagV2Count: 0 }, 'MATERIAL_INACTIVE'],
    [{ id: 8, concursoId: 7, active: true, historyCount: 0, failedRagV2Count: 0, processingRagV2Count: 0, activeCompletedRagV2Count: 0 }, 'NO_FAILED_HISTORY'],
    [{ id: 8, concursoId: 7, active: true, historyCount: 2, failedRagV2Count: 1, processingRagV2Count: 1, activeCompletedRagV2Count: 0 }, 'PROCESSING_EXISTS'],
    [{ id: 8, concursoId: 7, active: true, historyCount: 2, failedRagV2Count: 1, processingRagV2Count: 0, activeCompletedRagV2Count: 1 }, 'ACTIVE_INGESTION_EXISTS'],
  ] as const
  for (const [found, code] of cases) await assert.rejects(run(found), (error: unknown) => error instanceof RetryRagValidationError && error.code === code)
  assert.equal(calls, 0)
})

function retryPersistence() {
  const state = { reservations: 0, latest: 'erro', documents: 0, historicalFailed: 4 }
  const persistence: RagPersistence = {
    async findMaterial() { return { id: 8, concursoId: 7, provaId: null, titulo: 'CF', githubPath: 'safe/file.txt', tipoArquivo: 'txt', arquivoOrigem: 'file.txt', disciplina: 'Direito Constitucional', assunto: 'Constituição Federal', subassunto: null, ativo: true } },
    async createIngestion() { throw new Error('INITIAL não deve ser usado') },
    async createFailedIngestionRetry() { state.reservations += 1; state.latest = 'processando'; return 18 + state.reservations },
    async createReprocessingIngestion() { throw new Error('REPROCESS não deve ser usado') },
    async insertDocuments(rows) { state.documents += rows.length }, async setTotalChunks() {},
    async countDocuments() { return state.documents }, async activateIngestion() { state.latest = 'concluida' },
    async markIngestionFailed() { state.latest = 'erro' },
    async failOrphanedIngestion() { state.latest = 'erro' },
  }
  return { state, persistence }
}

const embeddings = { embed: async (requests: readonly unknown[]) => requests.map(() => ({ values: Array(768).fill(0), provider: 'google' as const, model: 'gemini-embedding-2', dimensions: 768 })) }

test('retry mockado bem-sucedido usa pipeline comum e preserva histórico', async () => {
  const { state, persistence } = retryPersistence()
  const result = await retryFailedMaterialIngestion(8, { repository: { owner: 'o', repository: 'r', ref: 'main' }, persistence,
    fetchImpl: async () => new Response('conteúdo constitucional válido', { status: 200, headers: { 'content-type': 'text/plain' } }), embeddings })
  assert.equal(result.status, 'activated')
  assert.equal(state.latest, 'concluida')
  assert.equal(state.historicalFailed, 4)
  assert.ok(state.documents > 0)
})

test('falha mockada deixa uma próxima tentativa elegível', async () => {
  const { state, persistence } = retryPersistence()
  const dependencies = { repository: { owner: 'o', repository: 'r', ref: 'main' }, persistence,
    fetchImpl: async () => new Response(null, { status: 500 }), embeddings }
  await assert.rejects(retryFailedMaterialIngestion(8, dependencies))
  assert.equal(state.latest, 'erro')
  await assert.rejects(retryFailedMaterialIngestion(8, dependencies))
  assert.equal(state.reservations, 2)
})

test('UI e Server Action expõem retry autenticado e bloqueiam clique duplicado', async () => {
  const action = await readFile('src/app/(dashboard)/admin/concursos/actions.ts', 'utf8')
  const retry = action.slice(action.indexOf('export async function retryRagIngestionAction'))
  assert.ok(retry.indexOf('await requireAdmin()') < retry.indexOf('createAdminClient()'))
  assert.match(retry, /await executeRetryRag/)
  assert.match(retry, /retryFailedMaterialIngestion/)
  const button = await readFile('src/app/(dashboard)/admin/concursos/[id]/retry-rag-button.tsx', 'utf8')
  assert.match(button, /Tentar novamente/)
  assert.match(button, /disabled=\{pending\}/)
})
