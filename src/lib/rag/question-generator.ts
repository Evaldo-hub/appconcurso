import 'server-only'

import { z } from 'zod'
import { generateWithGemini, getConfiguredGeminiModel, type GeminiGenerationTelemetry, type GeminiGenerateOptions } from '@/lib/ai/gemini'
import { generateWithGroq, getConfiguredGroqModel } from '@/lib/ai/groq'
import { createGeminiGroqFallback, isGeminiGroqFallbackAllowed } from '@/lib/ai/gemini-groq-fallback'
import { parseRagGeneratedQuestion, resolveGeneratedQuestionSources } from './generated-question'
import { buildRagGenerationContext, type RagGenerationContext } from './generation-context'
import type { RagRetrievalInput } from './types'

const generationInputSchema = z.object({
  query: z.string().trim().min(1),
  concursoId: z.number().int().positive(),
  provaId: z.number().int().positive().nullable().optional(),
  disciplina: z.string().trim().min(1),
  assunto: z.string().trim().min(1),
  subassunto: z.string().trim().min(1).nullable().optional(),
  banca: z.string().trim().min(1),
  dificuldade: z.enum(['facil', 'media', 'dificil']),
  numeroQuestao: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(20).optional(),
  threshold: z.number().min(0).max(1).optional(),
}).strict()

export type RagQuestionGenerationInput = z.input<typeof generationInputSchema>

export interface RagTextGenerationResult {
  text: string
  provider: string
  model: string
  telemetry?: GeminiGenerationTelemetry
}

export interface RagQuestionGeneratorDependencies {
  buildContext: (input: RagRetrievalInput) => Promise<RagGenerationContext>
  generate: (prompt: string) => Promise<RagTextGenerationResult>
}

export interface RagQuestionGenerationResult {
  question: ReturnType<typeof parseRagGeneratedQuestion>
  resolvedSources: ReturnType<typeof resolveGeneratedQuestionSources>
  retrieval: RagGenerationContext['retrieval']
  generation: { provider: string; model: string; telemetry?: GeminiGenerationTelemetry }
}

export class RagQuestionGenerationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RagQuestionGenerationError'
  }
}

export class QuestionAiUnavailableError extends Error {
  constructor(
    readonly primary: { provider: 'gemini'; status?: number; errorName: string },
    readonly fallback: { provider: 'groq'; status?: number; errorName: string; attempted: boolean },
  ) {
    super('Os serviços de IA estão temporariamente indisponíveis. O conteúdo RAG foi encontrado, mas não foi possível gerar a questão agora.')
    this.name = 'QuestionAiUnavailableError'
  }
}

export const isQuestionGenerationFallbackAllowed = isGeminiGroqFallbackAllowed

function createPrompt(input: z.output<typeof generationInputSchema>, contextText: string) {
  const subassunto = input.subassunto ?? null
  const numeroQuestao = input.numeroQuestao ?? 1
  return `Você deve criar uma questão usando SOMENTE O CONTEXTO FORNECIDO abaixo.

Regras obrigatórias:
- Use somente fatos demonstráveis no CONTEXTO RAG fornecido; não use conhecimento externo.
- Não invente fatos, legislação, datas, requisitos ou IDs.
- Toda questão deve ser sustentada por pelo menos uma [FONTE N].
- sourceIndexes deve conter somente os números das fontes efetivamente utilizadas.
- O gabarito deve ser demonstrável pelas fontes.
- A explicação deve justificar por que a alternativa correta é correta e, quando possível, por que as demais estão incorretas.
- Não mencione RAG, chunk, embedding ou detalhes internos no enunciado.
- Retorne somente JSON puro, sem markdown e sem campos extras.

O JSON deve seguir exatamente este contrato:
{
  "numeroQuestao": ${numeroQuestao},
  "disciplina": ${JSON.stringify(input.disciplina)},
  "assunto": ${JSON.stringify(input.assunto)},
  "subassunto": ${JSON.stringify(subassunto)},
  "banca": ${JSON.stringify(input.banca)},
  "dificuldade": ${JSON.stringify(input.dificuldade)},
  "enunciado": "texto não vazio",
  "alternativas": { "A": "...", "B": "...", "C": "...", "D": "...", "E": "..." },
  "gabarito": "A|B|C|D|E",
  "explicacao": "texto não vazio",
  "sourceIndexes": [1]
}

Solicitação: ${input.query}

CONTEXTO RAG:
${contextText}`
}

function assertControlledMetadata(
  question: ReturnType<typeof parseRagGeneratedQuestion>,
  input: z.output<typeof generationInputSchema>,
) {
  const expected = {
    numeroQuestao: input.numeroQuestao ?? 1,
    disciplina: input.disciplina,
    assunto: input.assunto,
    subassunto: input.subassunto ?? null,
    banca: input.banca,
    dificuldade: input.dificuldade,
  }
  for (const [field, value] of Object.entries(expected)) {
    if (question[field as keyof typeof expected] !== value) {
      throw new RagQuestionGenerationError(`RAG_GENERATION_METADATA_MISMATCH: ${field}`)
    }
  }
}

export function createRagQuestionGenerator(dependencies: RagQuestionGeneratorDependencies) {
  return async function generateQuestion(rawInput: RagQuestionGenerationInput): Promise<RagQuestionGenerationResult> {
    const input = generationInputSchema.parse(rawInput)
    const context = await dependencies.buildContext({
      query: input.query,
      concursoId: input.concursoId,
      provaId: input.provaId ?? null,
      limit: input.limit,
      threshold: input.threshold,
    })
    if (!context.hasContext || context.sourceCount === 0) {
      throw new RagQuestionGenerationError('RAG_CONTEXT_NOT_FOUND')
    }

    const generated = await dependencies.generate(createPrompt(input, context.contextText))
    const question = parseRagGeneratedQuestion(generated.text)
    assertControlledMetadata(question, input)
    const resolvedSources = resolveGeneratedQuestionSources(question, context)

    return {
      question,
      resolvedSources,
      retrieval: { ...context.retrieval },
      generation: { provider: generated.provider, model: generated.model, ...(generated.telemetry ? { telemetry: generated.telemetry } : {}) },
    }
  }
}

export async function generateRagQuestionWithConfiguredGemini(
  prompt: string,
  testOptions: Pick<GeminiGenerateOptions, 'retryDependencies'> = {},
): Promise<RagTextGenerationResult> {
  let respondingModel = getConfiguredGeminiModel()
  let telemetry: GeminiGenerationTelemetry | undefined
  const text = await generateWithGemini({
    prompt,
    temperature: 0.2,
    responseFormat: 'json',
    fallbackPolicy: 'forbid',
    onMetadata: (metadata) => { respondingModel = metadata.model },
    onTelemetry: (value) => { telemetry = value },
    ...testOptions,
  })
  return { text, provider: 'gemini', model: respondingModel, telemetry }
}

export interface QuestionProviderFallbackDependencies {
  primary: (prompt: string) => Promise<RagTextGenerationResult>
  fallback: (prompt: string) => Promise<RagTextGenerationResult>
  sleep?: (delayMs: number) => Promise<void>
  fallbackConfigured?: () => boolean
  logger?: Pick<Console, 'info' | 'warn' | 'error'>
}

export function createRagQuestionProviderFallback(dependencies: QuestionProviderFallbackDependencies) {
  return createGeminiGroqFallback<RagTextGenerationResult>({
    scope: 'QUESTION_AI', ...dependencies,
    createUnavailableError: (primary, fallback) => new QuestionAiUnavailableError(
      { provider: 'gemini', status: primary.status, errorName: primary.errorName },
      { provider: 'groq', status: fallback.status, errorName: fallback.errorName, attempted: fallback.attempted ?? false },
    ),
  })
}

export const generateRagQuestionWithProviderFallback = createRagQuestionProviderFallback({
  primary: generateRagQuestionWithConfiguredGemini,
  async fallback(prompt) {
    const text = await generateWithGroq({ prompt, temperature: 0.2, responseFormat: 'json' })
    return { text, provider: 'groq', model: getConfiguredGroqModel() }
  },
})

export const generateRagQuestion = createRagQuestionGenerator({
  buildContext: buildRagGenerationContext,
  generate: generateRagQuestionWithProviderFallback,
})
