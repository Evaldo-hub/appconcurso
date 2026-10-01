import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import type { RagGeneratedQuestion, ResolvedGeneratedQuestionSource } from './generated-question'
import { createApprovedRagQuestionPersistence } from './question-persistence'
import type { RagQuestionValidationResult } from './question-validator'

const question: RagGeneratedQuestion = {
  numeroQuestao: 1, disciplina: 'Legislação/Normas do Concurso', assunto: 'Prazo de validade', subassunto: 'Prorrogação',
  banca: 'Cebraspe', dificuldade: 'media', enunciado: 'Qual é o prazo de validade?',
  alternativas: { A: 'Um ano', B: 'Dois anos', C: 'Três anos', D: 'Quatro anos', E: 'Indeterminado' },
  gabarito: 'B', explicacao: 'O edital estabelece dois anos.', sourceIndexes: [1],
}
const source: ResolvedGeneratedQuestionSource = {
  sourceIndex: 1, documentId: 2830, materialId: 4, ingestionId: 2, concursoId: 7, provaId: null,
  pagina: 34, chunkIndex: 33, similarity: 0.672, arquivoOrigem: 'edital.pdf', githubPath: 'edital.pdf', content: 'Dois anos.',
}
const validation: RagQuestionValidationResult = {
  modelVerdict: 'approved', finalVerdict: 'approved',
  checks: { statementSupported: true, correctAnswerSupported: true, explanationSupported: true, noContradiction: true, sourcesSufficient: true },
  unsupportedClaims: [], contradictions: [], reasoning: 'Aprovada.', validatedSourceIndexes: [1],
  validation: { provider: 'gemini', model: 'mock' },
}
const input = { question, resolvedSources: [source], semanticValidation: validation, concursoId: 7, provaId: null }

function setup(data: unknown = [{ questao_id: 99, status: 'cadastrada', fontes_inseridas: 1 }], error: { message?: string } | null = null) {
  let calls = 0
  let name = ''
  let parameters: Record<string, unknown> = {}
  const persist = createApprovedRagQuestionPersistence({
    async rpc(rpcName, rpcParameters) { calls += 1; name = rpcName; parameters = rpcParameters; return { data, error } },
  })
  return { persist, state: () => ({ calls, name, parameters }) }
}

test('approved permite uma única chamada à RPC oficial', async () => {
  const mock = setup()
  await mock.persist(input)
  assert.equal(mock.state().calls, 1)
  assert.equal(mock.state().name, 'persistir_questao_rag_aprovada')
})

test('rejected bloqueia RPC', async () => {
  const mock = setup()
  await assert.rejects(mock.persist({ ...input, semanticValidation: { ...validation, finalVerdict: 'rejected' } }), /NOT_APPROVED/)
  assert.equal(mock.state().calls, 0)
})

test('ausência de validation bloqueia RPC', async () => {
  const mock = setup()
  await assert.rejects(mock.persist({ ...input, semanticValidation: undefined }), /VALIDATION_REQUIRED/)
  assert.equal(mock.state().calls, 0)
})

for (const [name, mutation, error] of [
  ['zero sources', { resolvedSources: [] }, 'NO_SOURCES'],
  ['source duplicada', { resolvedSources: [source, { ...source }] }, 'DUPLICATE_SOURCE'],
  ['documentId duplicado', { question: { ...question, sourceIndexes: [1, 2] }, resolvedSources: [source, { ...source, sourceIndex: 2 }] }, 'DUPLICATE_DOCUMENT'],
  ['documentId inválido', { resolvedSources: [{ ...source, documentId: 0 }] }, 'INVALID_DOCUMENT'],
  ['materialId inválido', { resolvedSources: [{ ...source, materialId: 0 }] }, 'INVALID_MATERIAL'],
  ['ingestionId inválido', { resolvedSources: [{ ...source, ingestionId: 0 }] }, 'INVALID_INGESTION'],
  ['chunkIndex inválido', { resolvedSources: [{ ...source, chunkIndex: -1 }] }, 'INVALID_CHUNK'],
  ['pagina inválida', { resolvedSources: [{ ...source, pagina: 0 }] }, 'INVALID_PAGE'],
  ['similarity NaN', { resolvedSources: [{ ...source, similarity: Number.NaN }] }, 'INVALID_SIMILARITY'],
  ['concursoId inválido', { concursoId: 0 }, 'INVALID_CONCURSO'],
  ['provaId inválido', { provaId: 0 }, 'INVALID_PROVA'],
] as const) {
  test(`${name} bloqueia antes da RPC`, async () => {
    const mock = setup()
    await assert.rejects(mock.persist({ ...input, ...mutation } as typeof input), new RegExp(error))
    assert.equal(mock.state().calls, 0)
  })
}

test('questão, alternativas, gabarito e explicação são mapeados sem reescrita', async () => {
  const mock = setup()
  await mock.persist(input)
  const p = mock.state().parameters
  assert.equal(p.p_enunciado, question.enunciado)
  assert.deepEqual([p.p_alternativa_a, p.p_alternativa_b, p.p_alternativa_c, p.p_alternativa_d, p.p_alternativa_e], Object.values(question.alternativas))
  assert.equal(p.p_gabarito, 'B')
  assert.equal(p.p_explicacao, question.explicacao)
  assert.equal(p.p_dificuldade, 'Média')
  assert.match(String(p.p_hash_questao), /^[0-9a-f]{64}$/)
})

test('IDs e provenance enviados vêm exclusivamente de resolvedSources', async () => {
  const mock = setup()
  await mock.persist(input)
  assert.deepEqual(mock.state().parameters.p_document_ids, [2830])
  assert.equal('p_fontes' in mock.state().parameters, false)
  for (const forbidden of ['material', 'ingestion', 'pagina', 'chunk', 'arquivo_origem', 'github_path']) {
    assert.equal(Object.keys(mock.state().parameters).some((key) => key.includes(forbidden)), false)
  }
})

test('hash inválido bloqueia antes da RPC', async () => {
  let calls = 0
  const persist = createApprovedRagQuestionPersistence({ async rpc() { calls += 1; return { data: null, error: null } } }, { hash: () => 'inválido' })
  await assert.rejects(persist(input), /INVALID_HASH/)
  assert.equal(calls, 0)
})

test('resultado cadastrada é parseado', async () => {
  assert.deepEqual(await setup().persist(input), { questaoId: 99, status: 'cadastrada', fontesInseridas: 1 })
})

test('duplicada com zero fontes é aceita e preserva ID existente', async () => {
  const result = await setup([{ questao_id: 77, status: 'duplicada', fontes_inseridas: 0 }]).persist(input)
  assert.deepEqual(result, { questaoId: 77, status: 'duplicada', fontesInseridas: 0 })
})

for (const invalid of [
  null, [], [{ questao_id: 0, status: 'cadastrada', fontes_inseridas: 1 }],
  [{ questao_id: 1, status: 'outro', fontes_inseridas: 1 }],
  [{ questao_id: 1, status: 'cadastrada', fontes_inseridas: 0 }],
  [{ questao_id: 1, status: 'duplicada', fontes_inseridas: 1 }],
]) {
  test('resposta RPC estruturalmente inválida é rejeitada', async () => {
    await assert.rejects(setup(invalid).persist(input), /INVALID_RPC_RESULT/)
  })
}

test('erro RPC é sanitizado sem segredo', async () => {
  await assert.rejects(setup(null, { message: 'service_role=segredo' }).persist(input), (error: unknown) => {
    assert.equal((error as Error).message, 'RAG_PERSISTENCE_RPC_FAILED')
    assert.doesNotMatch((error as Error).message, /segredo|service_role/)
    return true
  })
})

test('migration proposta mantém atomicidade, invoker e política conservadora', async () => {
  const sql = await readFile('supabase/migrations/20260925_020_add_atomic_rag_question_persistence.sql', 'utf8')
  assert.match(sql, /security invoker/i)
  assert.match(sql, /set search_path = pg_catalog, pg_temp/i)
  assert.match(sql, /exception when unique_violation/i)
  assert.match(sql, /'duplicada'::text, 0/i)
  assert.match(sql, /insert into public\.questao_fontes \(questao_id, document_id, pagina\)/i)
  assert.match(sql, /p_document_ids bigint\[\]/i)
  assert.match(sql, /cardinality\(p_document_ids\) <> \(select count\(distinct/i)
  assert.match(sql, /d\.ingestion_version = 'rag-v2'/i)
  assert.match(sql, /r\.embedding_model = 'gemini-embedding-2'/i)
  assert.match(sql, /d\.embedding_model = r\.embedding_model/i)
  assert.match(sql, /r\.status = 'concluida'[\s\S]+r\.ativa = true/i)
  assert.doesNotMatch(sql, /alter table/i)
  assert.doesNotMatch(sql, /validate constraint/i)
  assert.match(sql, /revoke all[\s\S]+from public, anon, authenticated/i)
  assert.match(sql, /grant execute[\s\S]+to service_role/i)
})

test('migration reproduz integralmente elegibilidade e escopo do retrieval RAG-V2', async () => {
  const sql = await readFile('supabase/migrations/20260925_020_add_atomic_rag_question_persistence.sql', 'utf8')
  const requiredConditions = [
    /join public\.materiais_concurso m on m\.id = d\.material_id/i,
    /join public\.rag_ingestoes r on r\.id = d\.ingestion_id/i,
    /d\.concurso_id = p_concurso_id/i,
    /m\.concurso_id = p_concurso_id/i,
    /m\.ativo = true/i,
    /r\.material_id = m\.id/i,
    /r\.status = 'concluida'/i,
    /r\.ativa = true/i,
    /r\.ingestion_version = 'rag-v2'/i,
    /r\.embedding_provider = 'google'/i,
    /r\.embedding_model = 'gemini-embedding-2'/i,
    /r\.embedding_dimensions = 768/i,
    /d\.ingestion_version = 'rag-v2'/i,
    /d\.embedding_provider = r\.embedding_provider/i,
    /d\.embedding_model = r\.embedding_model/i,
    /d\.embedding_dimensions = r\.embedding_dimensions/i,
    /d\.embedding is not null/i,
    /p_prova_id is null and m\.prova_id is null/i,
    /p_prova_id is not null and \(m\.prova_id is null or m\.prova_id = p_prova_id\)/i,
    /v_document_count <> cardinality\(p_document_ids\)/i,
  ]
  for (const condition of requiredConditions) assert.match(sql, condition)
})

test('migration usa somente tabelas public qualificadas e search_path restrito', async () => {
  const sql = await readFile('supabase/migrations/20260925_020_add_atomic_rag_question_persistence.sql', 'utf8')
  assert.match(sql, /set search_path = pg_catalog, pg_temp/i)
  assert.doesNotMatch(sql, /set search_path\s*=\s*public/i)
  for (const table of ['questoes_estudo', 'questao_fontes', 'documents', 'materiais_concurso', 'rag_ingestoes']) {
    assert.match(sql, new RegExp(`public\\.${table}`, 'i'))
  }
})

test('23505 identifica hash primeiro, usa prova/enunciado somente com prova e re-raise desconhecido', async () => {
  const sql = await readFile('supabase/migrations/20260925_020_add_atomic_rag_question_persistence.sql', 'utf8')
  const block = sql.slice(sql.indexOf('exception when unique_violation'), sql.indexOf('insert into public.questao_fontes'))
  assert.ok(block.indexOf('q.hash_questao = p_hash_questao') < block.indexOf('p_prova_id is not null'))
  assert.match(block, /if v_questao_id is null and p_prova_id is not null then/i)
  assert.match(block, /q\.prova_id = p_prova_id[\s\S]+q\.enunciado = trim\(p_enunciado\)/i)
  assert.match(block, /if v_questao_id is null then raise; end if;/i)
  assert.doesNotMatch(block, /is not distinct from p_prova_id/i)
})

test('erro de questao_fontes permanece fora do handler 23505 e propaga rollback', async () => {
  const sql = await readFile('supabase/migrations/20260925_020_add_atomic_rag_question_persistence.sql', 'utf8')
  const handlerEnd = sql.indexOf('end;\n\n  insert into public.questao_fontes')
  assert.ok(handlerEnd > sql.indexOf('exception when unique_violation'))
  assert.equal(sql.indexOf('exception when unique_violation', handlerEnd + 1), -1)
})
