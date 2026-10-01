import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import type { RagAdminIngestion, RagAdminMaterial } from './admin-status'
import { executeReprocessRag, failedReprocessRag, getReprocessingEligibility, ReprocessRagValidationError, successfulReprocessRag } from './admin-reprocess-ingestion'

function ingestion(overrides: Partial<RagAdminIngestion> = {}): RagAdminIngestion {
  return {
    ingestionId: 1, status: 'concluida', active: true, totalChunks: 24, documentCount: 24,
    error: null, embeddingProvider: 'google', embeddingModel: 'gemini-embedding-2', embeddingDimensions: 768,
    ingestionVersion: 'rag-v2', chunkingVersion: 'semantic-v1', startedAt: '', concludedAt: '', createdAt: '',
    ...overrides,
  }
}

function material(history: RagAdminIngestion[], active = true): RagAdminMaterial {
  return {
    materialId: 10, title: 'Material', fileType: 'pdf', sourceType: 'arquivo', githubPath: 'safe/file.pdf',
    concursoId: 7, provaId: null, provaLabel: null, active, ragStatus: 'READY',
    activeIngestion: history.find((item) => item.active && item.status === 'concluida') ?? null,
    ingestionHistory: history,
  }
}

test('somente READY ativo com exatamente uma RAG-V2 ativa concluída pode reprocessar', () => {
  const ready = material([ingestion()])
  assert.equal(getReprocessingEligibility(ready), 'eligible')
  assert.equal(getReprocessingEligibility(material([ingestion()], false)), 'ineligible')
  assert.equal(getReprocessingEligibility(material([])), 'ineligible')
  assert.equal(getReprocessingEligibility(material([ingestion(), ingestion({ ingestionId: 2 })])), 'ineligible')
  assert.equal(getReprocessingEligibility(material([ingestion(), ingestion({ ingestionId: 2, status: 'erro' })])), 'ineligible')
})

test('READY permanece visível e bloqueado quando há reprocessamento em andamento', () => {
  const current = material([ingestion({ ingestionId: 2, status: 'processando', active: false }), ingestion()])
  assert.equal(getReprocessingEligibility(current), 'processing')
})

test('valida material server-side antes de chamar o reprocessamento', async () => {
  let calls = 0
  const run = (found: Awaited<ReturnType<Parameters<typeof executeReprocessRag>[0]['findMaterial']>>) => executeReprocessRag({
    findMaterial: async () => found,
    reprocess: async () => { calls += 1 },
  }, 7, 10)
  for (const [found, code] of [
    [null, 'MATERIAL_NOT_FOUND'],
    [{ id: 10, concursoId: 7, active: false, activeRagV2Count: 1, activeCompletedRagV2Count: 1, processingRagV2Count: 0 }, 'MATERIAL_INACTIVE'],
    [{ id: 10, concursoId: 8, active: true, activeRagV2Count: 1, activeCompletedRagV2Count: 1, processingRagV2Count: 0 }, 'CROSS_CONTEST'],
    [{ id: 10, concursoId: 7, active: true, activeRagV2Count: 0, activeCompletedRagV2Count: 0, processingRagV2Count: 0 }, 'REPROCESSING_NOT_ALLOWED'],
    [{ id: 10, concursoId: 7, active: true, activeRagV2Count: 2, activeCompletedRagV2Count: 1, processingRagV2Count: 0 }, 'REPROCESSING_NOT_ALLOWED'],
    [{ id: 10, concursoId: 7, active: true, activeRagV2Count: 1, activeCompletedRagV2Count: 1, processingRagV2Count: 1 }, 'REPROCESSING_IN_PROGRESS'],
  ] as const) {
    await assert.rejects(run(found), (error: unknown) => error instanceof ReprocessRagValidationError && error.code === code)
  }
  assert.equal(calls, 0)
})

test('material elegível chama reprocessMaterial exatamente uma vez', async () => {
  let calls = 0
  await executeReprocessRag({
    findMaterial: async () => ({ id: 10, concursoId: 7, active: true, activeRagV2Count: 1, activeCompletedRagV2Count: 1, processingRagV2Count: 0 }),
    reprocess: async (id) => { calls += 1; assert.equal(id, 10) },
  }, 7, 10)
  assert.equal(calls, 1)
})

test('feedback de sucesso, erro e quota é fixo e sanitizado', () => {
  assert.deepEqual(successfulReprocessRag(), { status: 'success', message: 'Reprocessamento RAG concluído.' })
  assert.deepEqual(failedReprocessRag(new Error('Authorization: segredo SQL interno')), { status: 'error', message: 'Não foi possível concluir o reprocessamento RAG.' })
  const quota = Object.assign(new Error('raw provider body'), { classification: 'DAILY_QUOTA_EXHAUSTED' })
  assert.deepEqual(failedReprocessRag(quota), { status: 'quota', message: 'Limite diário de embeddings atingido.' })
})

test('Server Action autentica primeiro e botão protege clique duplicado', async () => {
  const action = await readFile('src/app/(dashboard)/admin/concursos/actions.ts', 'utf8')
  const reprocess = action.slice(action.indexOf('export async function reprocessRagMaterialAction'))
  assert.ok(reprocess.indexOf('await requireAdmin()') < reprocess.indexOf('createAdminClient()'))
  assert.match(reprocess, /await executeReprocessRag/)
  assert.match(reprocess, /await reprocessMaterial/)
  const button = await readFile('src/app/(dashboard)/admin/concursos/[id]/reprocess-rag-button.tsx', 'utf8')
  assert.match(button, /useActionState/)
  assert.match(button, /disabled=\{disabled \|\| pending\}/)
  assert.match(button, /Reprocessando RAG\.\.\./)
})
