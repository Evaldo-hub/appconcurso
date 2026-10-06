import assert from 'node:assert/strict'
import test from 'node:test'
import { GeminiGenerationError } from '@/lib/ai/gemini'
import { GroqGenerationError } from '@/lib/ai/groq'
import {
  createRagQuestionGenerator,
  createRagQuestionProviderFallback,
  isQuestionGenerationFallbackAllowed,
  QuestionAiUnavailableError,
} from './question-generator'
import type { RagGenerationContext } from './generation-context'

const promptSecret = 'PROMPT_PRIVATE_SOURCE_CONTENT'
const primaryFailure = (status?: number, message = 'high demand') => new GeminiGenerationError(message, {
  requestedModel: 'gemini-test', effectiveModel: 'gemini-test', attempts: 3, httpStatus: status,
})
const primaryResult = { text: '{"ok":true}', provider: 'gemini', model: 'gemini-test' }
const fallbackResult = { text: '{"ok":true}', provider: 'groq', model: 'groq-test' }
const silentLogger = { info() {}, warn() {}, error() {} }

test('Gemini com sucesso não chama Groq e reporta provider/model usados', async () => {
  let fallbackCalls = 0
  const generate = createRagQuestionProviderFallback({
    primary: async () => primaryResult,
    fallback: async () => { fallbackCalls += 1; return fallbackResult },
    fallbackConfigured: () => true, logger: silentLogger,
  })
  const result = await generate('prompt')
  assert.equal(fallbackCalls, 0)
  assert.deepEqual({ providerUsed: result.provider, modelUsed: result.model }, { providerUsed: 'gemini', modelUsed: 'gemini-test' })
})

for (const status of [429, 500, 502, 503, 504]) {
  test(`Gemini HTTP ${status} aciona Groq`, async () => {
    let fallbackCalls = 0
    const generate = createRagQuestionProviderFallback({
      primary: async () => { throw primaryFailure(status) },
      fallback: async () => { fallbackCalls += 1; return fallbackResult },
      fallbackConfigured: () => true, logger: silentLogger,
    })
    const result = await generate('same prompt')
    assert.equal(fallbackCalls, 1)
    assert.equal(result.provider, 'groq')
  })
}

test('Gemini timeout sem status aciona Groq', async () => {
  const error = primaryFailure(undefined, 'Tempo limite excedido.')
  assert.equal(isQuestionGenerationFallbackAllowed(error), true)
  const result = await createRagQuestionProviderFallback({
    primary: async () => { throw error }, fallback: async () => fallbackResult,
    fallbackConfigured: () => true, logger: silentLogger,
  })('same prompt')
  assert.equal(result.provider, 'groq')
})

test('caso real Gemini 503 high demand usa Groq com sucesso', async () => {
  const error = primaryFailure(503, 'high demand')
  let groqCalled = false
  const result = await createRagQuestionProviderFallback({
    primary: async () => { throw error },
    fallback: async () => { groqCalled = true; return fallbackResult },
    fallbackConfigured: () => true, logger: silentLogger,
  })('same prompt')
  assert.equal(isQuestionGenerationFallbackAllowed(error), true)
  assert.equal(groqCalled, true)
  assert.deepEqual({ generationSuccess: true, providerUsed: result.provider }, { generationSuccess: true, providerUsed: 'groq' })
})

test('falha permanente ou configuração inválida do Gemini não é mascarada', async () => {
  for (const error of [primaryFailure(401, 'credential rejected'), new Error('GEMINI_API_KEY não configurada.')]) {
    let fallbackCalls = 0
    const generate = createRagQuestionProviderFallback({
      primary: async () => { throw error }, fallback: async () => { fallbackCalls += 1; return fallbackResult },
      fallbackConfigured: () => true, logger: silentLogger,
    })
    await assert.rejects(generate('prompt'), (received) => received === error)
    assert.equal(fallbackCalls, 0)
  }
})

test('Gemini transitório e Groq não configurado retorna erro controlado sem fingir tentativa', async () => {
  let fallbackCalls = 0
  await assert.rejects(createRagQuestionProviderFallback({
    primary: async () => { throw primaryFailure(503) },
    fallback: async () => { fallbackCalls += 1; return fallbackResult },
    fallbackConfigured: () => false, logger: silentLogger,
  })('prompt'), (error: unknown) => error instanceof QuestionAiUnavailableError
    && error.fallback.errorName === 'FALLBACK_PROVIDER_NOT_CONFIGURED' && error.fallback.attempted === false)
  assert.equal(fallbackCalls, 0)
})

test('falha dos dois provedores retorna AI indisponível e limita retry Groq', async () => {
  let fallbackCalls = 0
  await assert.rejects(createRagQuestionProviderFallback({
    primary: async () => { throw primaryFailure(503) },
    fallback: async () => { fallbackCalls += 1; throw new GroqGenerationError('temporarily unavailable', { model: 'groq-test', httpStatus: 503, retryable: true }) },
    fallbackConfigured: () => true, sleep: async () => {}, logger: silentLogger,
  })('prompt'), (error: unknown) => error instanceof QuestionAiUnavailableError && error.fallback.attempted)
  assert.equal(fallbackCalls, 2)
})

test('fallback recebe exatamente o mesmo prompt e logs não expõem prompt nem segredo', async () => {
  let primaryPrompt = ''
  let fallbackPrompt = ''
  const logs: unknown[][] = []
  const logger = { info: (...args: unknown[]) => logs.push(args), warn: (...args: unknown[]) => logs.push(args), error: (...args: unknown[]) => logs.push(args) }
  await createRagQuestionProviderFallback({
    primary: async (prompt) => { primaryPrompt = prompt; throw primaryFailure(503, `high demand ${promptSecret}`) },
    fallback: async (prompt) => { fallbackPrompt = prompt; return fallbackResult },
    fallbackConfigured: () => true, logger,
  })(promptSecret)
  assert.equal(fallbackPrompt, primaryPrompt)
  const serialized = JSON.stringify(logs)
  assert.equal(serialized.includes(promptSecret), false)
  assert.equal(serialized.toLowerCase().includes('authorization'), false)
  assert.match(serialized, /PRIMARY_FAILED/)
  assert.match(serialized, /FALLBACK_SUCCESS/)
})

const validQuestion = {
  numeroQuestao: 1, disciplina: 'Lógica', assunto: 'Proposições', subassunto: null, banca: 'Cebraspe', dificuldade: 'media',
  enunciado: 'Assinale a correta.', alternativas: { A: 'A', B: 'B', C: 'C', D: 'D', E: 'E' },
  gabarito: 'A', explicacao: 'Explicação.', sourceIndexes: [1],
}
const ragContext: RagGenerationContext = {
  query: 'consulta', hasContext: true, contextText: '[FONTE 1]\nConteúdo.', contextCharacters: 20, estimatedTokens: 5, sourceCount: 1,
  sources: [{ sourceIndex: 1, documentId: 1, materialId: 22, ingestionId: 28, concursoId: 15, provaId: null, pagina: 1, chunkIndex: 0, similarity: .75, arquivoOrigem: 'fonte.pdf', githubPath: 'fonte.pdf', content: 'Conteúdo.' }],
  retrieval: { provider: 'google', model: 'gemini-embedding-2', dimensions: 768, matchCount: 1 },
}
const generationInput = { query: 'consulta', concursoId: 15, provaId: 75, disciplina: 'Lógica', assunto: 'Proposições', subassunto: null, banca: 'Cebraspe', dificuldade: 'media' as const, numeroQuestao: 1 }

test('fallback reutiliza o mesmo RagContext, não repete retrieval e passa pelo mesmo parser', async () => {
  let retrievalCalls = 0
  let primaryPrompt = ''
  let fallbackPrompt = ''
  const providerFallback = createRagQuestionProviderFallback({
    primary: async (prompt) => { primaryPrompt = prompt; throw primaryFailure(503) },
    fallback: async (prompt) => { fallbackPrompt = prompt; return { ...fallbackResult, text: JSON.stringify(validQuestion) } },
    fallbackConfigured: () => true, logger: silentLogger,
  })
  const result = await createRagQuestionGenerator({
    buildContext: async () => { retrievalCalls += 1; return ragContext }, generate: providerFallback,
  })(generationInput)
  assert.equal(retrievalCalls, 1)
  assert.equal(primaryPrompt, fallbackPrompt)
  assert.equal(result.question.gabarito, 'A')
  assert.deepEqual(result.generation, { provider: 'groq', model: 'groq-test' })
})

test('resposta Groq inválida é rejeitada pelo parser comum antes de qualquer persistência', async () => {
  let retrievalCalls = 0
  const generator = createRagQuestionGenerator({
    buildContext: async () => { retrievalCalls += 1; return ragContext },
    generate: createRagQuestionProviderFallback({
      primary: async () => { throw primaryFailure(503) }, fallback: async () => ({ ...fallbackResult, text: '{invalid' }),
      fallbackConfigured: () => true, logger: silentLogger,
    }),
  })
  await assert.rejects(generator(generationInput), /JSON válido/)
  assert.equal(retrievalCalls, 1)
})

test('NO_RAG_CONTEXT não chama nenhum provedor', async () => {
  let providerCalls = 0
  const emptyContext = { ...ragContext, hasContext: false, sourceCount: 0, sources: [], contextText: '' }
  await assert.rejects(createRagQuestionGenerator({
    buildContext: async () => emptyContext,
    generate: async () => { providerCalls += 1; return primaryResult },
  })(generationInput), /RAG_CONTEXT_NOT_FOUND/)
  assert.equal(providerCalls, 0)
})
