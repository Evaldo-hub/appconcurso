import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationPath = 'supabase/migrations/20261006_032_allow_general_taxonomy_rag_retrieval.sql'

interface RetrievalFixture {
  documentContestId: number
  materialContestId: number
  requestedContestId: number
  materialProofId: number | null
  requestedProofId: number | null
  documentDiscipline: string
  requestedDiscipline: string | null
  documentSubject: string | null
  requestedSubject: string | null
  documentSubsubject: string | null
  requestedSubsubject: string | null
  materialActive: boolean
  ingestionStatus: string
  ingestionActive: boolean
  ingestionVersion: string
  documentIngestionVersion: string
  embeddingProvider: string
  embeddingModel: string
  embeddingDimensions: number
  documentEmbeddingProvider: string
  documentEmbeddingModel: string
  documentEmbeddingDimensions: number
  hasEmbedding: boolean
}

const base: RetrievalFixture = {
  documentContestId: 15,
  materialContestId: 15,
  requestedContestId: 15,
  materialProofId: null,
  requestedProofId: 65,
  documentDiscipline: 'Direito Administrativo',
  requestedDiscipline: 'Direito Administrativo',
  documentSubject: null,
  requestedSubject: 'Processo administrativo',
  documentSubsubject: null,
  requestedSubsubject: 'Recurso administrativo',
  materialActive: true,
  ingestionStatus: 'concluida',
  ingestionActive: true,
  ingestionVersion: 'rag-v2',
  documentIngestionVersion: 'rag-v2',
  embeddingProvider: 'google',
  embeddingModel: 'gemini-embedding-2',
  embeddingDimensions: 768,
  documentEmbeddingProvider: 'google',
  documentEmbeddingModel: 'gemini-embedding-2',
  documentEmbeddingDimensions: 768,
  hasEmbedding: true,
}

function eligible(row: RetrievalFixture) {
  const proofMatches = row.requestedProofId === null
    ? row.materialProofId === null
    : row.materialProofId === null || row.materialProofId === row.requestedProofId
  return row.documentContestId === row.requestedContestId
    && row.materialContestId === row.requestedContestId
    && row.materialActive
    && proofMatches
    && row.ingestionStatus === 'concluida'
    && row.ingestionActive
    && row.ingestionVersion === 'rag-v2'
    && row.embeddingProvider === 'google'
    && row.embeddingModel === 'gemini-embedding-2'
    && row.embeddingDimensions === 768
    && row.documentIngestionVersion === 'rag-v2'
    && row.documentEmbeddingProvider === row.embeddingProvider
    && row.documentEmbeddingModel === row.embeddingModel
    && row.documentEmbeddingDimensions === row.embeddingDimensions
    && row.hasEmbedding
    && (row.requestedDiscipline === null || row.documentDiscipline === row.requestedDiscipline)
    && (row.requestedSubject === null || row.documentSubject === null || row.documentSubject === row.requestedSubject)
    && (row.requestedSubsubject === null || row.documentSubsubject === null || row.documentSubsubject === row.requestedSubsubject)
}

test('taxonomia geral passa e taxonomia especifica permanece isolada', () => {
  assert.equal(eligible(base), true, 'assunto e subassunto NULL devem passar')
  assert.equal(eligible({ ...base, documentSubject: base.requestedSubject }), true, 'assunto exato deve passar')
  assert.equal(eligible({ ...base, documentSubject: 'Licitações' }), false, 'assunto diferente deve ser bloqueado')
  assert.equal(eligible({ ...base, documentSubsubject: base.requestedSubsubject }), true, 'subassunto exato deve passar')
  assert.equal(eligible({ ...base, documentSubsubject: 'Competência' }), false, 'subassunto diferente deve ser bloqueado')
})

test('disciplina, concurso e prova continuam estritos', () => {
  assert.equal(eligible({ ...base, documentDiscipline: 'Língua Portuguesa' }), false)
  assert.equal(eligible({ ...base, documentContestId: 16, materialContestId: 16 }), false)
  assert.equal(eligible({ ...base, materialProofId: null }), true, 'material geral deve passar para C03')
  assert.equal(eligible({ ...base, materialProofId: 65 }), true, 'material C03 deve passar para C03')
  assert.equal(eligible({ ...base, materialProofId: 64 }), false, 'material de outra prova deve ser bloqueado')
})

test('estado do material, ingestao e embedding continuam estritos', () => {
  assert.equal(eligible({ ...base, materialActive: false }), false)
  assert.equal(eligible({ ...base, ingestionActive: false }), false)
  assert.equal(eligible({ ...base, ingestionStatus: 'erro' }), false)
  assert.equal(eligible({ ...base, ingestionVersion: 'rag-v1' }), false)
  assert.equal(eligible({ ...base, documentIngestionVersion: 'rag-v1' }), false)
  assert.equal(eligible({ ...base, embeddingModel: 'outro-modelo' }), false)
  assert.equal(eligible({ ...base, documentEmbeddingDimensions: 3072 }), false)
  assert.equal(eligible({ ...base, hasEmbedding: false }), false)
})

test('migration altera somente a semantica NULL de assunto e subassunto', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /p_assunto is null\s+or d\.assunto is null\s+or d\.assunto = p_assunto/i)
  assert.match(sql, /p_subassunto is null\s+or d\.subassunto is null\s+or d\.subassunto = p_subassunto/i)
  assert.match(sql, /p_disciplina is null or d\.disciplina = p_disciplina/i)
  assert.doesNotMatch(sql, /d\.disciplina is null/i)
  assert.match(sql, /d\.concurso_id = p_concurso_id/i)
  assert.match(sql, /m\.concurso_id = p_concurso_id/i)
  assert.match(sql, /p_prova_id is null and m\.prova_id is null/i)
  assert.match(sql, /m\.prova_id is null\s+or m\.prova_id = p_prova_id/i)
  assert.match(sql, /p_similarity_threshold is null[\s\S]*>= p_similarity_threshold/i)
  assert.match(sql, /p_match_count[^;]+default 8/i)
  assert.match(sql, /p_match_count[^;]+> 50/i)
})

test('migration preserva contrato, seguranca, versoes e permissoes da RPC', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /p_query_embedding public\.vector\(768\)/i)
  assert.match(sql, /language plpgsql\s+stable\s+security invoker/i)
  assert.match(sql, /set search_path = pg_catalog, pg_temp/i)
  assert.match(sql, /m\.ativo = true/i)
  assert.match(sql, /i\.status = 'concluida'/i)
  assert.match(sql, /i\.ativa = true/i)
  assert.match(sql, /i\.ingestion_version = 'rag-v2'/i)
  assert.match(sql, /i\.embedding_provider = 'google'/i)
  assert.match(sql, /i\.embedding_model = 'gemini-embedding-2'/i)
  assert.match(sql, /i\.embedding_dimensions = 768/i)
  assert.match(sql, /d\.embedding is not null/i)
  assert.match(sql, /order by d\.embedding operator\(public\.<=>\) p_query_embedding/i)
  assert.match(sql, /revoke all[\s\S]+from public, anon, authenticated/i)
  assert.match(sql, /grant execute[\s\S]+to service_role/i)
  assert.doesNotMatch(sql, /\b(update|insert into|delete from|truncate|drop)\b/i)
})

test('RPC classificada continua delegando a base e priorizando norma oficial', async () => {
  const sql = await readFile('supabase/migrations/20261002_031_add_rag_document_classification.sql', 'utf8')
  assert.match(sql, /from public\.match_documents_rag_v2\(/i)
  assert.match(sql, /when m\.categoria_documental = 'NORMA_OFICIAL' then 0/i)
})
