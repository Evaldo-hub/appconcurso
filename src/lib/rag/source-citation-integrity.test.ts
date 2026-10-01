import assert from 'node:assert/strict'
import test from 'node:test'
import { extractReferencedSourceIndexes, parseRagGeneratedQuestion, validateSourceCitationIntegrity, type RagGeneratedQuestion, type ResolvedGeneratedQuestionSource } from './generated-question'
import { createApprovedRagQuestionPersistence } from './question-persistence'
import { createRagQuestionValidator, validateWithConfiguredGemini, type RagQuestionValidationResult } from './question-validator'

const question: RagGeneratedQuestion = parseRagGeneratedQuestion({
  numeroQuestao: 1, disciplina: 'Direito Constitucional', assunto: 'Direitos Sociais', subassunto: 'Direitos sociais',
  banca: 'Cebraspe', dificuldade: 'media', enunciado: 'Assinale a alternativa correta.',
  alternativas: { A: 'A', B: 'B', C: 'C', D: 'D', E: 'E' }, gabarito: 'A',
  explicacao: 'Correta conforme [FONTE 1].', sourceIndexes: [1],
})
const source = (sourceIndex = 1): ResolvedGeneratedQuestionSource => ({
  sourceIndex, documentId: 3345 + sourceIndex, materialId: 7, ingestionId: 13, concursoId: 7, provaId: null,
  pagina: 7, chunkIndex: 6, similarity: 0.77, arquivoOrigem: 'cf.pdf', githubPath: 'cf.pdf', content: 'Conteudo constitucional.',
})
const approvedModel = { verdict: 'approved' as const, checks: { statementSupported: true, correctAnswerSupported: true, explanationSupported: true, noContradiction: true, sourcesSufficient: true }, unsupportedClaims: [], contradictions: [], reasoning: 'Aprovada.' }
const approvedValidation: RagQuestionValidationResult = { modelVerdict: 'approved', finalVerdict: 'approved', checks: approvedModel.checks, unsupportedClaims: [], contradictions: [], reasoning: 'Aprovada.', validatedSourceIndexes: [1], validation: { provider: 'mock', model: 'model-A' } }

test('parser recognizes canonical marker, casing and reasonable whitespace only', () => {
  assert.deepEqual(extractReferencedSourceIndexes('[FONTE 10] [fonte 1] [Fonte   2] [FONTE 1] fonte 99'), [1, 2, 10])
})

test('question 218 fixture fails for undeclared FONTE 3', () => {
  const result = validateSourceCitationIntegrity({ ...question, explicacao: 'Conforme [FONTE 1] e [FONTE 3].' })
  assert.equal(result.valid, false)
  assert.deepEqual(result.referencedSourceIndexes, [1, 3])
  assert.deepEqual(result.undeclaredReferencedSources, [3])
})

test('valid, multiple, repeated and absent markers have deterministic results', () => {
  assert.equal(validateSourceCitationIntegrity(question).valid, true)
  assert.equal(validateSourceCitationIntegrity({ ...question, sourceIndexes: [1, 3], explicacao: '[FONTE 1] [FONTE 3]' }).valid, true)
  assert.deepEqual(validateSourceCitationIntegrity({ ...question, explicacao: '[FONTE 1] [FONTE 1] [FONTE 1]' }).referencedSourceIndexes, [1])
  const absent = validateSourceCitationIntegrity({ ...question, explicacao: 'Sem marcador textual.' })
  assert.equal(absent.valid, true)
  assert.deepEqual(absent.declaredButNotTextuallyReferenced, [1])
  assert.deepEqual(validateSourceCitationIntegrity({ ...question, sourceIndexes: [1, 2], explicacao: '[FONTE 3]' }).undeclaredReferencedSources, [3])
})

test('undeclared textual source blocks semantic model call', async () => {
  let calls = 0
  const validate = createRagQuestionValidator({ validateWithModel: async () => { calls += 1; return { text: JSON.stringify(approvedModel), provider: 'mock', model: 'model-A' } } })
  await assert.rejects(validate({ question: { ...question, explicacao: '[FONTE 1] [FONTE 3]' }, resolvedSources: [source()] }), /UNDECLARED_SOURCE_CITATION/)
  assert.equal(calls, 0)
})

test('declared but uncited source does not block semantic model', async () => {
  let calls = 0
  const validate = createRagQuestionValidator({ validateWithModel: async () => { calls += 1; return { text: JSON.stringify(approvedModel), provider: 'mock', model: 'model-A' } } })
  await validate({ question: { ...question, sourceIndexes: [1, 2] }, resolvedSources: [source(1), source(2)] })
  assert.equal(calls, 1)
})

test('forged approved result with undeclared citation blocks persistence RPC', async () => {
  let calls = 0
  const persist = createApprovedRagQuestionPersistence({ async rpc() { calls += 1; return { data: null, error: null } } })
  await assert.rejects(persist({ question: { ...question, explicacao: '[FONTE 1] [FONTE 3]' }, resolvedSources: [source()], semanticValidation: approvedValidation, concursoId: 7, provaId: null }), /UNDECLARED_SOURCE_CITATION/)
  assert.equal(calls, 0)
})

test('official semantic validator adapter forbids fallback', async () => {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.GEMINI_API_KEY
  const originalModel = process.env.GEMINI_MODEL
  const calls: string[] = []
  process.env.GEMINI_API_KEY = 'validator-test-secret'
  process.env.GEMINI_MODEL = 'validator-model-A'
  globalThis.fetch = (async (input) => {
    calls.push(String(input))
    return new Response(JSON.stringify({ error: { message: 'high demand' } }), { status: 503 })
  }) as typeof fetch
  try {
    await assert.rejects(validateWithConfiguredGemini('private prompt', { retryDependencies: { sleep: async () => {}, random: () => 0, now: () => 0 } }))
    assert.equal(calls.length, 3)
    assert.ok(calls.every((url) => url.includes('validator-model-A')))
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey
    if (originalModel === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = originalModel
  }
})
