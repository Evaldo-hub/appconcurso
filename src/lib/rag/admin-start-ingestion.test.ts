import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import type { RagAdminMaterial, RagAdminMaterialStatus } from './admin-status'
import { canStartInitialRagIngestion, executeStartRagIngestion, failedStartRagIngestion, StartRagIngestionValidationError, successfulStartRagIngestion } from './admin-start-ingestion'

function material(status: RagAdminMaterialStatus, active = true, hasHistory = status !== 'PENDING'): RagAdminMaterial {
  return {
    materialId: 10, title: 'Material', fileType: 'pdf', sourceType: 'arquivo', githubPath: 'safe/file.pdf',
    concursoId: 7, provaId: null, provaLabel: null, active, ragStatus: status, activeIngestion: null,
    ingestionHistory: hasHistory ? [{ ingestionId: 1, status: 'erro', active: false, totalChunks: 0, documentCount: 0,
      error: null, embeddingProvider: 'google', embeddingModel: 'gemini-embedding-2', embeddingDimensions: 768,
      ingestionVersion: 'rag-v2', chunkingVersion: 'semantic-v1', startedAt: '', concludedAt: null, createdAt: '' }] : [],
  }
}

test('somente material ativo PENDING sem histórico RAG-V2 exibe início', () => {
  assert.equal(canStartInitialRagIngestion(material('PENDING')), true)
  for (const status of ['READY', 'PROCESSING', 'ERROR', 'DAILY_QUOTA_BLOCKED'] as const) {
    assert.equal(canStartInitialRagIngestion(material(status)), false)
  }
  assert.equal(canStartInitialRagIngestion(material('PENDING', false)), false)
  assert.equal(canStartInitialRagIngestion(material('PENDING', true, true)), false)
})

test('valida material server-side antes de chamar o pipeline', async () => {
  let ingestions = 0
  const run = (found: Awaited<ReturnType<Parameters<typeof executeStartRagIngestion>[0]['findMaterial']>>) => executeStartRagIngestion({
    findMaterial: async () => found,
    ingest: async () => { ingestions += 1 },
  }, 7, 10)
  for (const [found, code] of [
    [null, 'MATERIAL_NOT_FOUND'],
    [{ id: 10, concursoId: 7, active: false, hasRagV2History: false }, 'MATERIAL_INACTIVE'],
    [{ id: 10, concursoId: 8, active: true, hasRagV2History: false }, 'CROSS_CONTEST'],
    [{ id: 10, concursoId: 7, active: true, hasRagV2History: true }, 'INITIAL_INGESTION_NOT_ALLOWED'],
  ] as const) {
    await assert.rejects(run(found), (error: unknown) => error instanceof StartRagIngestionValidationError && error.code === code)
  }
  assert.equal(ingestions, 0)
})

test('material elegível chama o pipeline exatamente uma vez', async () => {
  let calls = 0
  await executeStartRagIngestion({
    findMaterial: async () => ({ id: 10, concursoId: 7, active: true, hasRagV2History: false }),
    ingest: async (id) => { calls += 1; assert.equal(id, 10) },
  }, 7, 10)
  assert.equal(calls, 1)
})

test('feedback de sucesso, erro e quota é fixo e sanitizado', () => {
  assert.deepEqual(successfulStartRagIngestion(), { status: 'success', message: 'Ingestão RAG concluída.' })
  assert.deepEqual(failedStartRagIngestion(new Error('Authorization: segredo SQL interno')), { status: 'error', message: 'Não foi possível concluir a ingestão RAG.' })
  const quota = Object.assign(new Error('raw provider body'), { classification: 'DAILY_QUOTA_EXHAUSTED' })
  assert.deepEqual(failedStartRagIngestion(quota), { status: 'quota', message: 'Limite diário de embeddings atingido.' })
})

test('Server Action autentica primeiro e botão protege clique duplicado', async () => {
  const action = await readFile('src/app/(dashboard)/admin/concursos/actions.ts', 'utf8')
  const start = action.slice(action.indexOf('export async function startRagIngestionAction'))
  assert.ok(start.indexOf('await requireAdmin()') < start.indexOf('createAdminClient()'))
  assert.match(start, /await executeStartRagIngestion/)
  assert.match(start, /await ingestMaterial/)
  const button = await readFile('src/app/(dashboard)/admin/concursos/[id]/start-rag-button.tsx', 'utf8')
  assert.match(button, /useActionState/)
  assert.match(button, /disabled=\{pending\}/)
  assert.match(button, /Processando RAG\.\.\./)
})
