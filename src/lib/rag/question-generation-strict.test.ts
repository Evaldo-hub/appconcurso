import assert from 'node:assert/strict'
import test from 'node:test'
import { GeminiGenerationError, generateWithGemini } from '@/lib/ai/gemini'
import { validateSourceCitationIntegrity } from './generated-question'
import type { RagGenerationContext } from './generation-context'
import { createApprovedRagQuestionPersistence } from './question-persistence'
import { createRagQuestionGenerator, generateRagQuestionWithConfiguredGemini } from './question-generator'
import { createRagQuestionValidator } from './question-validator'

const validQuestion = {
  numeroQuestao: 1, disciplina: 'Direito Constitucional', assunto: 'Direitos Sociais', subassunto: 'Artigo 6', banca: 'Cebraspe', dificuldade: 'media',
  enunciado: 'Assinale a alternativa correta conforme [FONTE 1].', alternativas: { A: 'Correta.', B: 'Errada.', C: 'Errada.', D: 'Errada.', E: 'Errada.' },
  gabarito: 'A', explicacao: 'A alternativa A decorre diretamente da [FONTE 1].', sourceIndexes: [1],
}
const context: RagGenerationContext = {
  query: 'consulta', hasContext: true, contextText: '[FONTE 1]\nConteudo constitucional.', contextCharacters: 36, estimatedTokens: 9, sourceCount: 1,
  retrieval: { provider: 'google', model: 'gemini-embedding-2', dimensions: 768, matchCount: 1 },
  sources: [{ sourceIndex: 1, documentId: 3346, materialId: 7, ingestionId: 13, concursoId: 7, provaId: null, pagina: 7, chunkIndex: 6, similarity: 0.77, arquivoOrigem: 'cf.pdf', githubPath: 'cf.pdf', content: 'Conteudo constitucional.' }],
}
const input = { query: 'consulta', concursoId: 7, provaId: null, disciplina: 'Direito Constitucional', assunto: 'Direitos Sociais', subassunto: 'Artigo 6', banca: 'Cebraspe', dificuldade: 'media' as const, numeroQuestao: 1 }
const success = () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(validQuestion) }] } }] })
const failure = () => Response.json({ error: { code: 503, status: 'UNAVAILABLE', message: 'high demand' } }, { status: 503 })
const noWait = { sleep: async () => {}, random: () => 0, now: () => 0 }

async function mockedGemini(handler: (url: string, call: number) => Response, run: (calls: string[]) => Promise<void>) {
  const originalFetch = globalThis.fetch; const originalKey = process.env.GEMINI_API_KEY; const originalModel = process.env.GEMINI_MODEL; const calls: string[] = []
  process.env.GEMINI_API_KEY = 'strict-generation-test-key'; process.env.GEMINI_MODEL = 'rag-model-A'
  globalThis.fetch = (async (request) => { calls.push(String(request)); return handler(String(request), calls.length) }) as typeof fetch
  try { await run(calls) } finally { globalThis.fetch = originalFetch; if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey; if (originalModel === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = originalModel }
}

test('RAG generation strict succeeds with configured model and telemetry', async () => {
  await mockedGemini(() => success(), async (calls) => {
    const result = await generateRagQuestionWithConfiguredGemini('private prompt')
    assert.equal(calls.length, 1)
    assert.deepEqual(result.telemetry, { requestedModel: 'rag-model-A', effectiveModel: 'rag-model-A', attempts: 1, fallbackUsed: false })
  })
})

test('RAG generation strict retries only the configured model', async () => {
  await mockedGemini((_url, call) => call === 1 ? failure() : success(), async (calls) => {
    const result = await generateRagQuestionWithConfiguredGemini('private prompt', { retryDependencies: noWait })
    assert.equal(calls.length, 2); assert.ok(calls.every((url) => url.includes('rag-model-A'))); assert.equal(result.telemetry?.attempts, 2); assert.equal(result.telemetry?.fallbackUsed, false)
  })
})

test('RAG generation strict exhaustion never calls fallback and produces no question', async () => {
  await mockedGemini(() => failure(), async (calls) => {
    const generator = createRagQuestionGenerator({ buildContext: async () => context, generate: (prompt) => generateRagQuestionWithConfiguredGemini(prompt, { retryDependencies: noWait }) })
    const semanticCalls = 0; const persistenceCalls = 0
    await assert.rejects(generator(input), (error: unknown) => {
      assert.ok(error instanceof GeminiGenerationError); assert.equal(error.requestedModel, 'rag-model-A'); assert.equal(error.effectiveModel, 'rag-model-A'); assert.equal(error.attempts, 3); assert.equal(error.fallbackUsed, false); return true
    })
    assert.equal(calls.length, 3); assert.ok(calls.every((url) => url.includes('rag-model-A'))); assert.equal(semanticCalls, 0); assert.equal(persistenceCalls, 0)
  })
})

test('global Gemini default remains allow for legacy callers', async () => {
  await mockedGemini((url) => url.includes('rag-model-A') ? failure() : success(), async (calls) => {
    await generateWithGemini({ prompt: 'legacy prompt', retryDependencies: noWait })
    assert.equal(calls.length, 4); assert.ok(calls[3].includes('gemini-3.6-flash'))
  })
})

test('strict generation and strict validation expose separate telemetry and produce persistence-ready object', async () => {
  await mockedGemini(() => success(), async () => {
    const generator = createRagQuestionGenerator({ buildContext: async () => context, generate: (prompt) => generateRagQuestionWithConfiguredGemini(prompt) })
    const generated = await generator(input)
    assert.equal(validateSourceCitationIntegrity(generated.question).valid, true)
    const validationTelemetry = { requestedModel: 'rag-model-A', effectiveModel: 'rag-model-A', attempts: 2, fallbackUsed: false }
    const validator = createRagQuestionValidator({ validateWithModel: async () => ({ text: JSON.stringify({ verdict: 'approved', checks: { statementSupported: true, correctAnswerSupported: true, explanationSupported: true, noContradiction: true, sourcesSufficient: true }, unsupportedClaims: [], contradictions: [], reasoning: 'Aprovada.' }), provider: 'gemini', model: 'rag-model-A', telemetry: validationTelemetry }) })
    const validation = await validator({ question: generated.question, resolvedSources: generated.resolvedSources })
    let rpcCalls = 0
    const persist = createApprovedRagQuestionPersistence({ async rpc() { rpcCalls += 1; return { data: [{ questao_id: 999, status: 'cadastrada', fontes_inseridas: 1 }], error: null } } })
    const result = await persist({ question: generated.question, resolvedSources: generated.resolvedSources, semanticValidation: validation, concursoId: 7, provaId: null })
    assert.equal(result.status, 'cadastrada'); assert.equal(rpcCalls, 1)
    assert.deepEqual(generated.generation.telemetry, { requestedModel: 'rag-model-A', effectiveModel: 'rag-model-A', attempts: 1, fallbackUsed: false })
    assert.deepEqual(validation.validation.telemetry, validationTelemetry)
  })
})
