import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { classifyRagQueryIntent, selectDiverseRagResults } from './retrieval'
import { RAG_CONFIG } from './config'

const migrationPath = 'supabase/migrations/20261002_031_add_rag_document_classification.sql'

test('classifica consultas do certame e de conhecimento deterministicamente', () => {
  assert.equal(classifyRagQueryIntent('Quando será aplicada a prova do TRT8 2026?'), 'CERTAME')
  assert.equal(classifyRagQueryIntent('Quais são as penalidades disciplinares previstas na Lei 8.112?'), 'CONHECIMENTO')
  assert.equal(classifyRagQueryIntent('Quais são as modalidades previstas na Lei 14.133?'), 'CONHECIMENTO')
  assert.equal(classifyRagQueryIntent('Quais direitos são previstos no Estatuto da Pessoa com Deficiência?'), 'CONHECIMENTO')
})

test('prioriza categoria adequada sem remover candidatos vetoriais legítimos', () => {
  const base = { materialId: 1, similarity: 0.90 }
  const certame = selectDiverseRagResults([
    { ...base, documentId: 1, categoryPriority: 1 },
    { ...base, documentId: 2, materialId: 2, similarity: 0.80, categoryPriority: 0 },
  ], 2)
  assert.deepEqual(certame.map((item) => item.documentId), [2, 1])

  const knowledge = selectDiverseRagResults([
    { ...base, documentId: 3, categoryPriority: 4 },
    { ...base, documentId: 4, materialId: 2, similarity: 0.80, categoryPriority: 0 },
  ], 2)
  assert.deepEqual(knowledge.map((item) => item.documentId), [4, 3])
})

test('migration é aditiva, extensível e preserva a RPC vetorial e o isolamento por prova', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /add column if not exists categoria_documental/i)
  for (const category of ['EDITAL', 'NORMA_OFICIAL', 'MANUAL_OFICIAL', 'DOCUMENTACAO_TECNICA_OFICIAL', 'PROVA_ANTERIOR', 'MATERIAL_EXPLICATIVO', 'OUTRO']) {
    assert.match(sql, new RegExp(`'${category}'`))
  }
  assert.match(sql, /from public\.match_documents_rag_v2\(/i)
  assert.doesNotMatch(sql, /\bdrop\b|delete from|truncate/i)
  const original = await readFile('supabase/migrations/20260929_023_fix_rag_retrieval_candidate_limit.sql', 'utf8')
  assert.match(original, /p_prova_id is null and m\.prova_id is null/i)
  assert.match(original, /m\.prova_id is null[\s\S]*m\.prova_id = p_prova_id/i)
})

test('primeiro lote permanece comum e não duplica leis por prova', async () => {
  const script = await readFile('scripts/trt8-2026-rag-first-batch-dry-run.ts', 'utf8')
  assert.match(script, /const CONTEST_SLUG = 'trt8-2026'/)
  assert.match(script, /prova: null/)
  assert.doesNotMatch(script, /concurso_id\s*[:=]\s*15/i)
  for (const law of ['8.112/1990', '8.429/1992', '9.784/1999', '14.133/2021', '13.146/2015']) {
    assert.equal((script.match(new RegExp(`title: 'Lei nº ${law.replace('.', '\\.')}'`, 'g')) ?? []).length, 1)
  }
})

test('classificação não altera configuração de embeddings', () => {
  assert.equal(RAG_CONFIG.embedding.model, 'gemini-embedding-2')
  assert.equal(RAG_CONFIG.embedding.dimensions, 768)
})
