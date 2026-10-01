import 'server-only'

import { z } from 'zod'
import { generateWithGemini, getConfiguredGeminiModel, type GeminiGenerationTelemetry, type GeminiGenerateOptions } from '@/lib/ai/gemini'
import { validateSourceCitationIntegrity, type RagGeneratedQuestion, type ResolvedGeneratedQuestionSource } from './generated-question'

const checksSchema = z.object({
  statementSupported: z.boolean(),
  correctAnswerSupported: z.boolean(),
  explanationSupported: z.boolean(),
  noContradiction: z.boolean(),
  sourcesSufficient: z.boolean(),
}).strict()

export const ragQuestionValidationSchema = z.object({
  verdict: z.enum(['approved', 'rejected']),
  checks: checksSchema,
  unsupportedClaims: z.array(z.string().trim().min(1)),
  contradictions: z.array(z.string().trim().min(1)),
  reasoning: z.string().trim().min(1),
}).strict()

export type RagQuestionValidationModelOutput = z.infer<typeof ragQuestionValidationSchema>

export interface RagQuestionValidationInput {
  question: RagGeneratedQuestion
  resolvedSources: ResolvedGeneratedQuestionSource[]
}

export interface RagQuestionValidationModelResult {
  text: string
  provider: string
  model: string
  telemetry?: GeminiGenerationTelemetry
}

export interface RagQuestionValidatorDependencies {
  validateWithModel: (prompt: string) => Promise<RagQuestionValidationModelResult>
}

export interface RagQuestionValidationResult {
  modelVerdict: 'approved' | 'rejected'
  finalVerdict: 'approved' | 'rejected'
  checks: RagQuestionValidationModelOutput['checks']
  unsupportedClaims: string[]
  contradictions: string[]
  reasoning: string
  validatedSourceIndexes: number[]
  validation: { provider: string; model: string; telemetry?: GeminiGenerationTelemetry }
}

export class RagQuestionValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RagQuestionValidationError'
  }
}

function unwrapJsonFence(value: string) {
  const fenced = value.match(/^\s*```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/i)
  return fenced ? fenced[1] : value
}

export function parseRagQuestionValidation(value: unknown): RagQuestionValidationModelOutput {
  let candidate = value
  if (typeof value === 'string') {
    try {
      candidate = JSON.parse(unwrapJsonFence(value))
    } catch {
      throw new RagQuestionValidationError('RAG_VALIDATION_INVALID_JSON')
    }
  }
  const parsed = ragQuestionValidationSchema.safeParse(candidate)
  if (!parsed.success) throw new RagQuestionValidationError('RAG_VALIDATION_INVALID_CONTRACT')
  return parsed.data
}

function deterministicPrechecks({ question, resolvedSources }: RagQuestionValidationInput) {
  if (resolvedSources.length === 0) throw new RagQuestionValidationError('RAG_VALIDATION_NO_SOURCES')
  const resolvedIndexes = resolvedSources.map((source) => source.sourceIndex)
  if (new Set(resolvedIndexes).size !== resolvedIndexes.length) throw new RagQuestionValidationError('RAG_VALIDATION_DUPLICATE_SOURCE')
  if (
    question.sourceIndexes.length !== resolvedIndexes.length
    || question.sourceIndexes.some((sourceIndex) => !resolvedIndexes.includes(sourceIndex))
  ) throw new RagQuestionValidationError('RAG_VALIDATION_UNRESOLVED_SOURCE')
  if (resolvedSources.some((source) => !source.content.trim())) throw new RagQuestionValidationError('RAG_VALIDATION_EMPTY_SOURCE_CONTENT')
  if (!question.alternativas[question.gabarito]?.trim()) throw new RagQuestionValidationError('RAG_VALIDATION_INVALID_ANSWER')
  if (!question.enunciado.trim()) throw new RagQuestionValidationError('RAG_VALIDATION_EMPTY_STATEMENT')
  if (!question.explicacao.trim()) throw new RagQuestionValidationError('RAG_VALIDATION_EMPTY_EXPLANATION')
  if (!validateSourceCitationIntegrity(question).valid) throw new RagQuestionValidationError('RAG_VALIDATION_UNDECLARED_SOURCE_CITATION')
}

function validationPrompt({ question, resolvedSources }: RagQuestionValidationInput) {
  const sources = resolvedSources.map((source) => `[FONTE ${source.sourceIndex}]\n${source.content}`).join('\n\n')
  return `Atue somente como verificador documental. Não reescreva a questão.

Regras obrigatórias:
- Use SOMENTE as fontes fornecidas; não use conhecimento externo.
- Não presuma fatos ausentes, não complete lacunas e não corrija a fonte.
- Não aprove uma afirmação apenas por parecer verdadeira.
- Toda afirmação necessária ao gabarito deve estar demonstrável nas fontes.
- A alternativa correta deve ser sustentada e nenhuma concorrente pode também ser correta com base nas fontes.
- A explicação deve ser compatível com as fontes e não pode inventar justificativas externas.
- Qualquer contradição material deve reprovar a questão.
- Retorne somente JSON puro no contrato solicitado, sem campos extras.

QUESTÃO:
Enunciado: ${question.enunciado}
Alternativas:
A: ${question.alternativas.A}
B: ${question.alternativas.B}
C: ${question.alternativas.C}
D: ${question.alternativas.D}
E: ${question.alternativas.E}
Gabarito: ${question.gabarito}
Explicação: ${question.explicacao}

FONTES DECLARADAS:
${sources}

CONTRATO JSON:
{
  "verdict": "approved|rejected",
  "checks": {
    "statementSupported": true,
    "correctAnswerSupported": true,
    "explanationSupported": true,
    "noContradiction": true,
    "sourcesSufficient": true
  },
  "unsupportedClaims": [],
  "contradictions": [],
  "reasoning": "justificativa documental"
}`
}

export function createRagQuestionValidator(dependencies: RagQuestionValidatorDependencies) {
  return async function validateQuestion(input: RagQuestionValidationInput): Promise<RagQuestionValidationResult> {
    deterministicPrechecks(input)
    const generated = await dependencies.validateWithModel(validationPrompt(input))
    const parsed = parseRagQuestionValidation(generated.text)
    const allChecksPass = Object.values(parsed.checks).every((check) => check === true)
    const finalVerdict = parsed.verdict === 'approved' && allChecksPass ? 'approved' : 'rejected'
    return {
      modelVerdict: parsed.verdict,
      finalVerdict,
      checks: parsed.checks,
      unsupportedClaims: parsed.unsupportedClaims,
      contradictions: parsed.contradictions,
      reasoning: parsed.reasoning,
      validatedSourceIndexes: input.resolvedSources.map((source) => source.sourceIndex),
      validation: { provider: generated.provider, model: generated.model, ...(generated.telemetry ? { telemetry: generated.telemetry } : {}) },
    }
  }
}

export async function validateWithConfiguredGemini(
  prompt: string,
  testOptions: Pick<GeminiGenerateOptions, 'retryDependencies'> = {},
): Promise<RagQuestionValidationModelResult> {
  let respondingModel = getConfiguredGeminiModel()
  let telemetry: GeminiGenerationTelemetry | undefined
  const text = await generateWithGemini({
    prompt,
    temperature: 0,
    responseFormat: 'json',
    fallbackPolicy: 'forbid',
    onMetadata: (metadata) => { respondingModel = metadata.model },
    onTelemetry: (value) => { telemetry = value },
    ...testOptions,
  })
  return { text, provider: 'gemini', model: respondingModel, telemetry }
}

export const validateRagGeneratedQuestion = createRagQuestionValidator({
  validateWithModel: validateWithConfiguredGemini,
})
