import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createSupabaseRagPersistence } from './persistence'
import { classifyRagIngestionMode } from './admin-retry-ingestion'
import type { RagAdminMaterial, RagAdminIngestion } from './admin-status'
import { assertRagCliEnvironment, inspectRagCliEnvironment } from '../../../scripts/rag-cli-env'

const migrationPath = 'supabase/migrations/20260930_025_add_orphaned_rag_ingestion_recovery.sql'

test('RPC faz somente a transição processando/inativa para erro sob lock', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /fail_orphaned_rag_ingestion_v2\([\s\S]*p_ingestion_id bigint,[\s\S]*p_reason text/i)
  assert.match(sql, /pg_advisory_xact_lock\(v_material_id\)/i)
  assert.match(sql, /for update/i)
  assert.match(sql, /status <> 'processando'[\s\S]*v_ingestion\.ativa/i)
  assert.match(sql, /RAG_ORPHAN_STATE_CHANGED/)
  assert.match(sql, /RAG_ORPHAN_INGESTION_NOT_FOUND/)
  assert.match(sql, /set status = 'erro',[\s\S]*ativa = false,[\s\S]*erro = p_reason,[\s\S]*concluido_em = pg_catalog\.now\(\)/i)
  assert.doesNotMatch(sql, /delete\s+from|truncate|alter\s+table/i)
})

test('RPC é service_role-only e usa search_path restrito', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /security invoker\s+set search_path = pg_catalog, pg_temp/i)
  assert.match(sql, /revoke all[\s\S]+from public, anon, authenticated/i)
  assert.match(sql, /grant execute[\s\S]+to service_role/i)
})

test('persistence chama uma única vez a RPC com razão canônica', async () => {
  const calls: Array<{ name: string; args: unknown }> = []
  const admin = { async rpc(name: string, args: unknown) { calls.push({ name, args }); return { data: [], error: null } } }
  const persistence = createSupabaseRagPersistence(admin as never)
  await persistence.failOrphanedIngestion(21, 'ORPHANED_INGESTION_EXECUTOR_TERMINATED')
  assert.deepEqual(calls, [{ name: 'fail_orphaned_rag_ingestion_v2', args: { p_ingestion_id: 21, p_reason: 'ORPHANED_INGESTION_EXECUTOR_TERMINATED' } }])
})

test('histórico failed após recuperação classifica material como RETRY_FAILED', () => {
  const row = (id: number): RagAdminIngestion => ({ ingestionId: id, status: 'erro', active: false, totalChunks: 0, documentCount: 0, error: 'falha', embeddingProvider: 'google', embeddingModel: 'gemini-embedding-2', embeddingDimensions: 768, ingestionVersion: 'rag-v2', chunkingVersion: 'semantic-v1', startedAt: '', concludedAt: '', createdAt: '' })
  const material: RagAdminMaterial = { materialId: 8, title: 'CF', fileType: 'pdf', sourceType: 'arquivo', githubPath: 'cf.pdf', concursoId: 7, provaId: null, provaLabel: null, active: true, ragStatus: 'ERROR', activeIngestion: null, ingestionHistory: [14, 15, 16, 17, 21].map(row) }
  assert.equal(classifyRagIngestionMode(material), 'RETRY_FAILED')
  assert.deepEqual(material.ingestionHistory.map((item) => item.ingestionId), [14, 15, 16, 17, 21])
})

test('executor longo reutiliza pipeline, independe de HTTP e trata SIGINT/SIGTERM', async () => {
  const launcher = await readFile('scripts/run-rag-ingestion.ts', 'utf8')
  const worker = await readFile('scripts/run-rag-ingestion-worker.ts', 'utf8')
  assert.match(launcher, /--conditions=react-server/)
  assert.match(worker, /retryFailedMaterialIngestion/)
  assert.match(worker, /process\.once\('SIGINT'/)
  assert.match(worker, /process\.once\('SIGTERM'/)
  assert.match(worker, /failOrphanedIngestion/)
  assert.doesNotMatch(`${launcher}\n${worker}`, /NextResponse|Request|route\.ts|setTimeout/)
})

test('bootstrap CLI carrega a cadeia sem validar segredos nem iniciar operações no modo check', async () => {
  const adminWrapper = await readFile('src/lib/supabase/admin.ts', 'utf8')
  const adminCore = await readFile('src/lib/supabase/admin-core.ts', 'utf8')
  const worker = await readFile('scripts/run-rag-ingestion-worker.ts', 'utf8')
  assert.match(adminWrapper, /import 'server-only'/)
  assert.match(adminWrapper, /export \{ createAdminClient \} from '\.\/admin-core'/)
  assert.doesNotMatch(adminCore, /server-only|NEXT_PUBLIC_SUPABASE_(?:SECRET|SERVICE_ROLE)/)
  assert.match(worker, /if \(process\.argv\.includes\('--check'\)\) \{[\s\S]*RAG_CLI_BOOTSTRAP_OK[\s\S]*return/)
  assert.ok(worker.indexOf("process.argv.includes('--check')") < worker.indexOf('createAdminClient()'))
})

test('validação do ambiente informa somente nomes ausentes e nunca valores', () => {
  const complete = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-test-value',
    SUPABASE_SECRET_KEY: 'secret-test-value',
    GEMINI_API_KEY: 'gemini-test-value',
    RAG_GITHUB_OWNER: 'owner',
    RAG_GITHUB_REPOSITORY: 'repository',
    RAG_GITHUB_REF: 'main',
  }
  assert.ok(inspectRagCliEnvironment(complete).every((status) => status.present))

  assert.throws(
    () => assertRagCliEnvironment({}),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /^RAG_CLI_ENV_MISSING: NEXT_PUBLIC_SUPABASE_URL/)
      assert.doesNotMatch(error.message, /secret-test-value|gemini-test-value|public-test-value/)
      return true
    },
  )
})
