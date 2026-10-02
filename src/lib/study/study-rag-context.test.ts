import assert from 'node:assert/strict'
import test from 'node:test'
import { createStudyRagContextBuilder, selectEligibleDirectSources, type StudyRagQuestion } from './study-rag-context'

const question: StudyRagQuestion = {
  id: 9,
  concurso_id: 3,
  prova_id: 7,
  disciplina: 'Direito',
  assunto: 'Atos',
  subassunto: 'Validade',
  enunciado: 'Analise o ato administrativo.',
}

const validData = {
  documentIds: [11],
  documents: [{ id: 11, material_id: 21, ingestion_id: 31, concurso_id: 3, content: 'Conteúdo confirmado da fonte.', pagina: 5, chunk_index: 2, embedding_provider: 'google', embedding_model: 'gemini-embedding-2', embedding_dimensions: 768, ingestion_version: 'rag-v2' }],
  materials: [{ id: 21, concurso_id: 3, prova_id: 7, titulo: 'Manual', arquivo_origem: 'manual.pdf', ativo: true }],
  ingestions: [{ id: 31, material_id: 21, status: 'concluida', ativa: true, embedding_provider: 'google', embedding_model: 'gemini-embedding-2', embedding_dimensions: 768, ingestion_version: 'rag-v2' }],
}

test('usa questao_fontes válida como evidência primária sem vetor ou segredo', async () => {
  let retrievalCalls = 0
  const build = createStudyRagContextBuilder({
    loadDirect: async () => validData,
    retrieve: async () => { retrievalCalls += 1; return { matches: [] } },
  })
  const result = await build({ question, action: 'explicacao' })
  assert.equal(result.directSourceCount, 1)
  assert.equal(result.supplementalSourceCount, 0)
  assert.equal(retrievalCalls, 0)
  assert.match(result.contextText, /Conteúdo confirmado da fonte/)
  assert.deepEqual(result.sources, [{ documentId: 11, materialId: 21, titulo: 'Manual', pagina: 5, chunkIndex: 2 }])
  assert.doesNotMatch(JSON.stringify(result), /embedding|vector|api[_-]?key/i)
})

test('rejeita fontes inativas, históricas ou incompatíveis', () => {
  for (const mutate of [
    (data: typeof validData) => { data.materials[0].ativo = false },
    (data: typeof validData) => { data.ingestions[0].ativa = false },
    (data: typeof validData) => { data.ingestions[0].status = 'erro' },
    (data: typeof validData) => { data.documents[0].embedding_model = 'modelo-antigo' },
    (data: typeof validData) => { data.materials[0].prova_id = 99 },
  ]) {
    const copy = structuredClone(validData)
    mutate(copy)
    assert.equal(selectEligibleDirectSources(question, copy).length, 0)
  }
})

test('complementa contexto curto nos modos extensos preservando filtros da questão', async () => {
  let retrievalInput: Record<string, unknown> | undefined
  const build = createStudyRagContextBuilder({
    loadDirect: async () => validData,
    retrieve: async (input) => {
      retrievalInput = input as unknown as Record<string, unknown>
      return { matches: [{ documentId: 12, materialId: 22, ingestionId: 32, concursoId: 3, provaId: null, content: 'Complemento semântico.', similarity: 0.9, arquivoOrigem: 'lei.pdf', githubPath: 'lei.pdf', pagina: 8, chunkIndex: 1, disciplina: 'Direito', assunto: 'Atos', subassunto: 'Validade', embeddingModel: 'gemini-embedding-2' }] }
    },
  })
  const result = await build({ question, action: 'pergunta', studentQuestion: 'Qual é a regra?' })
  assert.equal(result.directSourceCount, 1)
  assert.equal(result.supplementalSourceCount, 1)
  assert.equal(retrievalInput?.concursoId, 3)
  assert.equal(retrievalInput?.provaId, 7)
  assert.equal(retrievalInput?.disciplina, 'Direito')
  assert.equal(retrievalInput?.assunto, 'Atos')
  assert.equal(retrievalInput?.subassunto, 'Validade')
})

test('sem fontes retorna contexto vazio de forma controlada', async () => {
  const build = createStudyRagContextBuilder({
    loadDirect: async () => ({ documentIds: [], documents: [], materials: [], ingestions: [] }),
    retrieve: async () => ({ matches: [] }),
  })
  const result = await build({ question, action: 'resumo' })
  assert.deepEqual(result, { contextText: '', sources: [], directSourceCount: 0, supplementalSourceCount: 0 })
})

test('mapa mental reutiliza complemento semântico RAG V2 escopado', async () => {
  let calls = 0
  const build = createStudyRagContextBuilder({
    loadDirect: async () => validData,
    retrieve: async (input) => {
      calls += 1
      assert.equal(input.concursoId, question.concurso_id)
      assert.equal(input.provaId, question.prova_id)
      assert.equal(input.assunto, question.assunto)
      return { matches: [] }
    },
  })
  const result = await build({ question, action: 'mapa_mental' })
  assert.equal(calls, 1)
  assert.equal(result.directSourceCount, 1)
})
