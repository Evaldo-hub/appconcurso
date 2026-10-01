import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { RAG_MAX_CANDIDATE_LIMIT, ragCandidateLimit } from './retrieval'

const migrationPath = 'supabase/migrations/20260929_023_fix_rag_retrieval_candidate_limit.sql'

test('RPC aceita todo o candidate pool oficial sem alterar o contrato', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.equal(RAG_MAX_CANDIDATE_LIMIT, 50)
  assert.equal(ragCandidateLimit(8), 32)
  assert.equal(ragCandidateLimit(20), 50)
  assert.match(sql, /p_match_count\s+is\s+null\s+or\s+p_match_count\s+<\s+1\s+or\s+p_match_count\s+>\s+50/i)
  assert.match(sql, /p_match_count deve estar entre 1 e 50/i)
})

test('migration preserva assinatura, segurança, versão ativa e colunas atuais', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  for (const parameter of ['p_query_embedding', 'p_concurso_id', 'p_prova_id', 'p_match_count', 'p_similarity_threshold', 'p_disciplina', 'p_assunto', 'p_subassunto']) {
    assert.match(sql, new RegExp(`\\b${parameter}\\b`))
  }
  assert.match(sql, /p_query_embedding\s+public\.vector\(768\)/i)
  assert.match(sql, /security invoker/i)
  assert.match(sql, /set search_path = pg_catalog, pg_temp/i)
  assert.match(sql, /d\.pagina/i)
  assert.match(sql, /i\.status = 'concluida'/i)
  assert.match(sql, /i\.ativa = true/i)
  assert.match(sql, /i\.ingestion_version = 'rag-v2'/i)
  assert.match(sql, /d\.ingestion_version = 'rag-v2'/i)
  assert.match(sql, /d\.concurso_id = p_concurso_id/i)
  assert.match(sql, /m\.prova_id = p_prova_id/i)
  assert.doesNotMatch(sql, /p_material_id/i)
  assert.match(sql, /revoke all[\s\S]+from public, anon, authenticated/i)
  assert.match(sql, /grant execute[\s\S]+to service_role/i)
})
