import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createSupabaseRagPersistence } from './persistence'

const migrationPath = 'supabase/migrations/20260929_021_rag_ingestion_atomic_reservation.sql'

test('migration reserva a primeira ingestao RAG-V2 com contrato seguro', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /create unique index uq_rag_ingestoes_material_rag_v2_processando/i)
  assert.match(sql, /where status = 'processando' and ingestion_version = 'rag-v2'/i)
  assert.match(sql, /group by material_id\s+having count\(\*\) > 1/i)
  assert.match(sql, /RAG_INGESTION_RESERVATION_MIGRATION_NEEDS_DATA_REVIEW/)
  assert.match(sql, /pg_advisory_xact_lock\(p_material_id\)/i)
  assert.match(sql, /from public\.materiais_concurso[\s\S]+for share/i)
  for (const error of ['MATERIAL_NOT_FOUND', 'MATERIAL_INACTIVE', 'INGESTION_ALREADY_PROCESSING', 'INITIAL_INGESTION_ALREADY_COMPLETED', 'INITIAL_INGESTION_REQUIRES_RETRY_FLOW']) {
    assert.match(sql, new RegExp(error))
  }
  assert.match(sql, /security invoker\s+set search_path = pg_catalog, pg_temp/i)
  assert.match(sql, /revoke all[\s\S]+from public, anon, authenticated/i)
  assert.match(sql, /grant execute[\s\S]+to service_role/i)
  assert.doesNotMatch(sql, /\b(delete|truncate|update)\b/i)
})

test('configuracao RAG fica server-side na RPC', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /'google'[\s\S]+'gemini-embedding-2'[\s\S]+768[\s\S]+'semantic-v1'[\s\S]+'rag-v2'/i)
  assert.doesNotMatch(sql, /p_(embedding|chunking|ingestion)_/i)
})

test('createIngestion usa uma unica chamada RPC e retorna a reserva', async () => {
  const calls: Array<{ name: string; args: unknown }> = []
  const admin = { rpc(name: string, args: unknown) {
    calls.push({ name, args })
    return { single: async () => ({ data: { ingestion_id: 321 }, error: null }) }
  } }
  const persistence = createSupabaseRagPersistence(admin as never)
  assert.equal(await persistence.createIngestion(17), 321)
  assert.deepEqual(calls, [{ name: 'start_rag_ingestion_v2', args: { p_material_id: 17 } }])
})

test('createFailedIngestionRetry usa a RPC dedicada e retorna a nova reserva', async () => {
  const calls: Array<{ name: string; args: unknown }> = []
  const admin = { rpc(name: string, args: unknown) {
    calls.push({ name, args })
    return { single: async () => ({ data: { ingestion_id: 654 }, error: null }) }
  } }
  const persistence = createSupabaseRagPersistence(admin as never)
  assert.equal(await persistence.createFailedIngestionRetry(8), 654)
  assert.deepEqual(calls, [{ name: 'start_rag_ingestion_retry_v2', args: { p_material_id: 8 } }])
})
