import assert from 'node:assert/strict'
import test from 'node:test'
import { GeminiGenerationError } from '@/lib/ai/gemini'
import { GroqGenerationError } from '@/lib/ai/groq'
import { generateStudyQuestionBatch } from '@/lib/study/generate-study-question'
import type { RagGenerationContext } from './generation-context'
import {
  createRagQuestionGenerator,
  createRagQuestionProviderFallback,
} from './question-generator'
import {
  createRagQuestionValidator,
  createSemanticValidationProviderFallback,
  SemanticAiUnavailableError,
} from './question-validator'

const approved = {
  verdict: 'approved' as const,
  checks: {
    statementSupported: true,
    correctAnswerSupported: true,
    explanationSupported: true,
    noContradiction: true,
    sourcesSufficient: true,
  },
  unsupportedClaims: [] as string[],
  contradictions: [] as string[],
  reasoning: 'A fonte sustenta integralmente a questão.',
}

const rejected = {
  ...approved,
  verdict: 'rejected' as const,
  checks: { ...approved.checks, correctAnswerSupported: false },
  unsupportedClaims: ['O gabarito não é sustentado pela fonte.'],
}

const question = {
  numeroQuestao: 1,
  disciplina: 'Direito Administrativo',
  assunto: 'Processo administrativo',
  subassunto: null,
  banca: 'Cebraspe',
  dificuldade: 'media' as const,
  enunciado: 'Assinale a alternativa correta.',
  alternativas: { A: 'Correta.', B: 'Incorreta.', C: 'Incorreta 2.', D: 'Incorreta 3.', E: 'Incorreta 4.' },
  gabarito: 'A' as const,
  explicacao: 'A alternativa A decorre da [FONTE 1].',
  sourceIndexes: [1],
}

const context: RagGenerationContext = {
  query: 'processo administrativo',
  hasContext: true,
  contextText: '[FONTE 1]\nConteúdo legal suficiente.',
  contextCharacters: 37,
  estimatedTokens: 10,
  sourceCount: 1,
  sources: [{
    sourceIndex: 1, documentId: 10, materialId: 21, ingestionId: 27, concursoId: 15,
    provaId: null, pagina: 1, chunkIndex: 0, similarity: 0.738, arquivoOrigem: 'lei.pdf',
    githubPath: 'lei.pdf', content: 'Conteúdo legal suficiente.',
  }],
  retrieval: { provider: 'google', model: 'gemini-embedding-2', dimensions: 768, matchCount: 1 },
}

const gemini503 = () => new GeminiGenerationError('high demand', {
  requestedModel: 'gemini-3.6-flash', effectiveModel: 'gemini-3.6-flash', attempts: 3, httpStatus: 503,
})
const modelResult = (output: unknown, provider: 'gemini' | 'groq') => ({
  text: JSON.stringify(output), provider, model: provider === 'gemini' ? 'gemini-3.6-flash' : 'openai/gpt-oss-120b',
})
const silentLogger = { info() {}, warn() {}, error() {} }

test('Gemini semantic validation success não chama Groq', async () => {
  let groqCalls = 0
  const validate = createRagQuestionValidator({
    validateWithModel: createSemanticValidationProviderFallback({
      primary: async () => modelResult(approved, 'gemini'),
      fallback: async () => { groqCalls += 1; return modelResult(approved, 'groq') },
      fallbackConfigured: () => true,
      logger: silentLogger,
    }),
  })
  const result = await validate({ question, resolvedSources: context.sources })
  assert.equal(result.finalVerdict, 'approved')
  assert.equal(result.validation.provider, 'gemini')
  assert.equal(groqCalls, 0)
})

test('Gemini semantic validation 503 usa Groq e mantém o mesmo prompt e parser', async () => {
  let primaryPrompt = ''
  let fallbackPrompt = ''
  const validate = createRagQuestionValidator({
    validateWithModel: createSemanticValidationProviderFallback({
      primary: async (prompt) => { primaryPrompt = prompt; throw gemini503() },
      fallback: async (prompt) => { fallbackPrompt = prompt; return modelResult(approved, 'groq') },
      fallbackConfigured: () => true,
      logger: silentLogger,
    }),
  })
  const result = await validate({ question, resolvedSources: context.sources })
  assert.equal(fallbackPrompt, primaryPrompt)
  assert.equal(result.finalVerdict, 'approved')
  assert.equal(result.validation.provider, 'groq')
})

test('Groq semanticamente inválido vira rejeição normal, não provider failure', async () => {
  const validate = createRagQuestionValidator({
    validateWithModel: createSemanticValidationProviderFallback({
      primary: async () => { throw gemini503() },
      fallback: async () => modelResult(rejected, 'groq'),
      fallbackConfigured: () => true,
      logger: silentLogger,
    }),
  })
  const result = await validate({ question, resolvedSources: context.sources })
  assert.equal(result.finalVerdict, 'rejected')
  assert.equal(result.validation.provider, 'groq')
})

test('Groq não configurado após Gemini 503 resulta em provider failure controlado', async () => {
  const validate = createRagQuestionValidator({
    validateWithModel: createSemanticValidationProviderFallback({
      primary: async () => { throw gemini503() },
      fallback: async () => modelResult(approved, 'groq'),
      fallbackConfigured: () => false,
      logger: silentLogger,
    }),
  })
  await assert.rejects(validate({ question, resolvedSources: context.sources }), (error: unknown) =>
    error instanceof SemanticAiUnavailableError && error.fallback.attempted === false)
})

test('falha dos dois providers na validação resulta em provider failure', async () => {
  let groqCalls = 0
  const validate = createRagQuestionValidator({
    validateWithModel: createSemanticValidationProviderFallback({
      primary: async () => { throw gemini503() },
      fallback: async () => {
        groqCalls += 1
        throw new GroqGenerationError('unavailable', { model: 'openai/gpt-oss-120b', httpStatus: 503, retryable: true })
      },
      fallbackConfigured: () => true,
      sleep: async () => {},
      logger: silentLogger,
    }),
  })
  await assert.rejects(validate({ question, resolvedSources: context.sources }), SemanticAiUnavailableError)
  assert.equal(groqCalls, 2)
})

test('logs semânticos não expõem prompt, questão, fonte ou segredo', async () => {
  const logs: unknown[][] = []
  const logger = {
    info: (...args: unknown[]) => logs.push(args),
    warn: (...args: unknown[]) => logs.push(args),
    error: (...args: unknown[]) => logs.push(args),
  }
  const validate = createRagQuestionValidator({
    validateWithModel: createSemanticValidationProviderFallback({
      primary: async () => { throw gemini503() },
      fallback: async () => modelResult(approved, 'groq'),
      fallbackConfigured: () => true,
      logger,
    }),
  })
  await validate({ question, resolvedSources: context.sources })
  const serialized = JSON.stringify(logs)
  assert.match(serialized, /SEMANTIC_AI.*PRIMARY_FAILED/)
  assert.match(serialized, /SEMANTIC_AI.*FALLBACK_SUCCESS/)
  assert.doesNotMatch(serialized, /Conteúdo legal suficiente|Assinale a alternativa|authorization|api.?key/i)
})

test('cenário real: Groq gera e valida após dois Gemini 503, concluindo lote com uma questão', async () => {
  let retrievalCalls = 0
  const generator = createRagQuestionGenerator({
    buildContext: async () => { retrievalCalls += 1; return context },
    generate: createRagQuestionProviderFallback({
      primary: async () => { throw gemini503() },
      fallback: async () => modelResult(question, 'groq'),
      fallbackConfigured: () => true,
      logger: silentLogger,
    }),
  })
  const validator = createRagQuestionValidator({
    validateWithModel: createSemanticValidationProviderFallback({
      primary: async () => { throw gemini503() },
      fallback: async () => modelResult(approved, 'groq'),
      fallbackConfigured: () => true,
      logger: silentLogger,
    }),
  })

  const batch = await generateStudyQuestionBatch(1, async (attempt) => {
    const generated = await generator({
      query: context.query, concursoId: 15, provaId: 75, disciplina: question.disciplina,
      assunto: question.assunto, subassunto: null, banca: question.banca, dificuldade: 'media', numeroQuestao: attempt,
    })
    const semantic = await validator({ question: generated.question, resolvedSources: generated.resolvedSources })
    assert.equal(semantic.finalVerdict, 'approved')
    return {
      attempt, questao_id: 1, status: 'created', disciplina: question.disciplina, assunto: question.assunto,
      subassunto: null, banca: question.banca, dificuldade: 'media', enunciado: question.enunciado,
      alternativas: question.alternativas,
    }
  })

  assert.equal(retrievalCalls, 1)
  assert.equal(batch.status, 'complete')
  assert.equal(batch.generatedCount, 1)
  assert.equal(batch.stoppedReason, null)
})

test('NO_RAG_CONTEXT não chama provider de geração nem de validação semântica', async () => {
  let providerCalls = 0
  const generator = createRagQuestionGenerator({
    buildContext: async () => ({ ...context, hasContext: false, sourceCount: 0, sources: [], contextText: '' }),
    generate: async () => { providerCalls += 1; return modelResult(question, 'gemini') },
  })
  await assert.rejects(generator({
    query: context.query, concursoId: 15, provaId: 75, disciplina: question.disciplina,
    assunto: question.assunto, subassunto: null, banca: question.banca, dificuldade: 'media', numeroQuestao: 1,
  }), /RAG_CONTEXT_NOT_FOUND/)
  assert.equal(providerCalls, 0)
})
