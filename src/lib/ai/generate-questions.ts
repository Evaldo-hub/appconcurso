import { buildQuestionPrompt } from './question-prompt'
import {
  generatedQuestionsWithDiversitySchema,
  type GeneratedQuestion,
  type GeneratedQuestions,
} from './question-schema'
import {
  assertConceptualDiversity,
  assertHistoricalConceptDiversity,
  assertUniqueQuestionBatch,
  createBalancedAnswerPlan,
  DiversityValidationError,
} from './question-diversity'
import {
  generateJsonWithFallback,
  type AiProvider,
  type QuestionProviders,
} from './provider-fallback'
import type { HistoricalConceptMap } from './historical-concept-map'
import { parseAiJson } from './ai-json'

interface GenerateQuestionsInput {
  disciplina: string
  assunto: string
  banca: string
  dificuldade: 'Fácil' | 'Média' | 'Difícil'
  quantidade: number
  contexto?: string
  enunciadosAnteriores?: string[]
  mapaConceitualHistorico?: HistoricalConceptMap
}

export type { AiProvider, QuestionProviders } from './provider-fallback'
export interface GenerateQuestionsResult extends GeneratedQuestions { provider: AiProvider }

function publicQuestion(question: Record<string, unknown>): GeneratedQuestion {
  return {
    enunciado: String(question.enunciado),
    alternativa_a: String(question.alternativa_a),
    alternativa_b: String(question.alternativa_b),
    alternativa_c: String(question.alternativa_c),
    alternativa_d: String(question.alternativa_d),
    alternativa_e: String(question.alternativa_e),
    gabarito: question.gabarito as GeneratedQuestion['gabarito'],
    explicacao: String(question.explicacao),
  }
}

export async function generateQuestions(input: GenerateQuestionsInput, providers?: QuestionProviders): Promise<GenerateQuestionsResult> {
  let diversityFeedback: string | undefined

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const prompt = buildQuestionPrompt({
      ...input,
      planoGabaritos: createBalancedAnswerPlan(input.quantidade),
      feedbackDiversidade: diversityFeedback,
      mapaConceitualHistorico: input.mapaConceitualHistorico,
    })
    const { rawResponse, provider, metadata } = await generateJsonWithFallback(prompt, providers, {
      operation: 'geração de questões',
      stage: 'question_generation',
    })

    const parsedResponse = parseAiJson(rawResponse, 'question_generation', provider, metadata)

    const validated = generatedQuestionsWithDiversitySchema.safeParse(parsedResponse)
    if (!validated.success) {
      const details = validated.error.issues.slice(0, 5).map((issue) => `${issue.path.length ? issue.path.join('.') : 'resposta'}: ${issue.message}`).join('; ')
      throw new Error(`${provider} retornou questões fora do formato esperado. ${details}`)
    }
    if (validated.data.questoes.length !== input.quantidade) {
      throw new Error(`${provider} retornou ${validated.data.questoes.length} questões, mas foram solicitadas ${input.quantidade}.`)
    }

    try {
      assertUniqueQuestionBatch(validated.data.questoes)
      assertConceptualDiversity(validated.data.questoes, validated.data.assunto_estreito)
      assertHistoricalConceptDiversity(validated.data.questoes, input.mapaConceitualHistorico, validated.data.assunto_estreito)
    } catch (error) {
      if (!(error instanceof DiversityValidationError)) throw error
      if (attempt === 1) throw new Error(`A retentativa ainda apresentou diversidade insuficiente. ${error.message}`)
      console.info('[AI] Retentativa de diversidade acionada.', { conceitosRepetidos: error.repeatedConcepts.length })
      diversityFeedback = error.message.includes('histórico recente')
        ? `${error.message} Não repita os mesmos enunciados nem a mesma estrutura de resolução.`
        : error.repeatedConcepts.length
          ? `Os conceitos centrais repetidos foram: ${error.repeatedConcepts.join(', ')}. Evite repeti-los no novo lote e não repita a mesma estrutura de resolução.`
          : `${error.message} Não repita os mesmos enunciados nem a mesma estrutura de resolução.`
      continue
    }

    console.info(`[AI][question_generation][${provider}] completed`)
    return { questoes: validated.data.questoes.map((question) => publicQuestion(question)), provider }
  }

  throw new Error('Não foi possível gerar um lote com diversidade suficiente.')
}
