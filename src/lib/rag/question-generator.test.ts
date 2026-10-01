import assert from 'node:assert/strict'
import test from 'node:test'
import { createRagQuestionGenerator, RagQuestionGenerationError } from './question-generator'
import type { RagGenerationContext } from './generation-context'

const input = {
  query: 'Crie uma questão sobre validade.',
  concursoId: 7,
  provaId: null,
  disciplina: 'Legislação/Normas do Concurso',
  assunto: 'Prazo de validade do concurso',
  subassunto: 'Prorrogação',
  banca: 'Cebraspe',
  dificuldade: 'media' as const,
  numeroQuestao: 1,
  limit: 5,
  threshold: 0.65,
}

const context: RagGenerationContext = {
  query: input.query,
  hasContext: true,
  contextText: '[FONTE 1]\nPrazo de validade de dois anos, prorrogável uma vez por igual período.',
  contextCharacters: 85,
  estimatedTokens: 22,
  sourceCount: 2,
  sources: [
    { sourceIndex: 1, documentId: 2830, materialId: 4, ingestionId: 2, concursoId: 7, provaId: null, pagina: 34, chunkIndex: 33, similarity: 0.71, arquivoOrigem: 'edital.pdf', githubPath: 'edital.pdf', content: 'Prazo de validade de dois anos.' },
    { sourceIndex: 2, documentId: 2831, materialId: 4, ingestionId: 2, concursoId: 7, provaId: null, pagina: 35, chunkIndex: 34, similarity: 0.68, arquivoOrigem: 'edital.pdf', githubPath: 'edital.pdf', content: 'Fonte secundária.' },
  ],
  retrieval: { provider: 'google', model: 'gemini-embedding-2', dimensions: 768, matchCount: 2 },
}

const validQuestion = {
  numeroQuestao: 1,
  disciplina: input.disciplina,
  assunto: input.assunto,
  subassunto: input.subassunto,
  banca: input.banca,
  dificuldade: input.dificuldade,
  enunciado: 'Sobre o prazo de validade, assinale a alternativa correta.',
  alternativas: { A: 'Um ano.', B: 'Dois anos, prorrogável uma vez por igual período.', C: 'Três anos.', D: 'Sem prorrogação.', E: 'Indeterminado.' },
  gabarito: 'B',
  explicacao: 'A fonte estabelece dois anos e uma prorrogação por igual período.',
  sourceIndexes: [1],
}

function setup(overrides: { context?: RagGenerationContext; response?: unknown } = {}) {
  let buildCalls = 0
  let generateCalls = 0
  let receivedInput: unknown
  let receivedPrompt = ''
  let persistenceCalls = 0
  const generator = createRagQuestionGenerator({
    buildContext: async (value) => { buildCalls += 1; receivedInput = value; return overrides.context ?? context },
    generate: async (prompt) => {
      generateCalls += 1
      receivedPrompt = prompt
      return { text: typeof overrides.response === 'string' ? overrides.response : JSON.stringify(overrides.response ?? validQuestion), provider: 'gemini', model: 'gemini-test' }
    },
  })
  return {
    generator,
    metrics: () => ({ buildCalls, generateCalls, receivedInput, receivedPrompt, persistenceCalls }),
    persist: () => { persistenceCalls += 1 },
  }
}

test('chama buildContext exatamente uma vez com os parâmetros de retrieval corretos', async () => {
  const harness = setup()
  await harness.generator(input)
  assert.equal(harness.metrics().buildCalls, 1)
  assert.deepEqual(harness.metrics().receivedInput, { query: input.query, concursoId: 7, provaId: null, limit: 5, threshold: 0.65 })
})

test('contexto vazio falha antes de chamar o LLM', async () => {
  const harness = setup({ context: { ...context, hasContext: false, sourceCount: 0, sources: [], contextText: '' } })
  await assert.rejects(harness.generator(input), (error: unknown) => error instanceof RagQuestionGenerationError && error.message === 'RAG_CONTEXT_NOT_FOUND')
  assert.equal(harness.metrics().generateCalls, 0)
})

test('contexto válido chama LLM uma vez e inclui contexto, regra e contrato JSON', async () => {
  const harness = setup()
  await harness.generator(input)
  const metrics = harness.metrics()
  assert.equal(metrics.generateCalls, 1)
  assert.match(metrics.receivedPrompt, /Prazo de validade de dois anos/)
  assert.match(metrics.receivedPrompt, /SOMENTE O CONTEXTO FORNECIDO/i)
  assert.match(metrics.receivedPrompt, /"sourceIndexes": \[1\]/)
  assert.match(metrics.receivedPrompt, /Retorne somente JSON puro/)
})

test('saída válida é parseada e fontes válidas são resolvidas com IDs do contexto', async () => {
  const result = await setup().generator(input)
  assert.equal(result.question.gabarito, 'B')
  assert.deepEqual(result.question.sourceIndexes, [1])
  assert.equal(result.resolvedSources[0].documentId, 2830)
  assert.equal(result.resolvedSources[0].materialId, 4)
  assert.equal(result.resolvedSources[0].ingestionId, 2)
})

test('JSON inválido é rejeitado', async () => {
  await assert.rejects(setup({ response: '{quebrado' }).generator(input), /JSON válido/)
})

test('sourceIndex inexistente é rejeitado', async () => {
  await assert.rejects(setup({ response: { ...validQuestion, sourceIndexes: [3] } }).generator(input), /sourceIndex 3/)
})

for (const [field, value] of [
  ['disciplina', 'Outra'], ['assunto', 'Outro'], ['subassunto', 'Outro'], ['banca', 'FGV'], ['dificuldade', 'dificil'], ['numeroQuestao', 2],
] as const) {
  test(`metadado divergente ${field} é rejeitado`, async () => {
    await assert.rejects(
      setup({ response: { ...validQuestion, [field]: value } }).generator(input),
      new RegExp(`RAG_GENERATION_METADATA_MISMATCH: ${field}`),
    )
  })
}

test('retorno contém somente metadados seguros, sem embedding ou secrets', async () => {
  const harness = setup()
  const result = await harness.generator(input)
  const keys: string[] = []
  JSON.stringify(result, (key, value) => { if (key) keys.push(key); return value })
  assert.equal(keys.some((key) => /^(embedding|api.?key|service.?role|authorization|headers)$/i.test(key)), false)
  assert.deepEqual(result.generation, { provider: 'gemini', model: 'gemini-test' })
  assert.equal(result.retrieval.dimensions, 768)
  assert.equal(harness.metrics().persistenceCalls, 0)
})
