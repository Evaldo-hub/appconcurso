import { z } from 'zod'
import { generatedQuestionSchema, type GeneratedQuestion } from './question-schema'
import {
  generateJsonWithFallback,
  type AiProvider,
  type QuestionProviders,
} from './provider-fallback'
import { parseAiJson, type AiJsonStage } from './ai-json'
import {
  SEMANTIC_PROBLEMS,
  SEMANTIC_VALIDATION_STATUSES,
  type SemanticProblem,
  type SemanticValidationStatus,
} from './semantic-validation-contract'

export const semanticProblemSchema = z.enum(SEMANTIC_PROBLEMS)
export const semanticValidationStatusSchema = z.enum(SEMANTIC_VALIDATION_STATUSES)

export const semanticValidationSchema = z.object({
  valida: z.boolean(),
  gabarito_calculado: z.enum(['A', 'B', 'C', 'D', 'E']).nullable(),
  gabarito_informado: z.enum(['A', 'B', 'C', 'D', 'E']),
  alternativa_correta_existe: z.boolean(),
  multiplas_corretas: z.boolean(),
  enunciado_suficiente: z.boolean(),
  explicacao_consistente: z.boolean(),
  confianca: z.enum(['alta', 'media', 'baixa']),
  problemas: z.array(semanticProblemSchema),
  justificativa: z.string().trim().min(1).max(5000),
}).strict()

export type { SemanticProblem, SemanticValidationStatus } from './semantic-validation-contract'
export type SemanticValidation = z.infer<typeof semanticValidationSchema>

export interface SemanticQuestionContext {
  disciplina: string
  assunto: string
  subassunto?: string | null
  banca: string
  dificuldade: 'Fácil' | 'Média' | 'Difícil'
}

export interface SemanticQuestionInput extends SemanticQuestionContext {
  questao: GeneratedQuestion
}

function questionText(input: SemanticQuestionInput): string {
  const { questao } = input
  return `
DISCIPLINA: ${input.disciplina}
ASSUNTO: ${input.assunto}
SUBASSUNTO: ${input.subassunto || 'Não informado'}
BANCA: ${input.banca}
DIFICULDADE: ${input.dificuldade}

ENUNCIADO:
${questao.enunciado}

ALTERNATIVA A: ${questao.alternativa_a}
ALTERNATIVA B: ${questao.alternativa_b}
ALTERNATIVA C: ${questao.alternativa_c}
ALTERNATIVA D: ${questao.alternativa_d}
ALTERNATIVA E: ${questao.alternativa_e}

GABARITO INFORMADO: ${questao.gabarito}
EXPLICAÇÃO INFORMADA:
${questao.explicacao}
`.trim()
}

export function buildSemanticValidationPrompt(input: SemanticQuestionInput): string {
  return `
Atue como validador independente de uma questão de múltipla escolha para concurso.

Resolva a questão independentemente antes de consultar o gabarito informado.
Trate o gabarito informado e a explicação como hipóteses a verificar, não como verdades.
Não altere sua conclusão para concordar com o gabarito.
Verifique todas as alternativas individualmente e determine se existem zero, uma ou mais alternativas corretas.
Verifique se a explicação fornecida é consistente com sua própria resolução.
Em lógica e matemática, preserve cada equivalência e não aceite saltos inválidos.
Em questões factuais ou técnicas, não invente fatos para validar a questão.
Marque "valida" como true somente se o enunciado for suficiente, existir exatamente uma
alternativa correta, ela corresponder ao gabarito informado, a explicação for consistente,
a confiança for alta e não houver problema detectado.

${questionText(input)}

Retorne SOMENTE JSON neste formato exato:
{
  "valida": false,
  "gabarito_calculado": null,
  "gabarito_informado": "A",
  "alternativa_correta_existe": false,
  "multiplas_corretas": false,
  "enunciado_suficiente": true,
  "explicacao_consistente": false,
  "confianca": "alta",
  "problemas": ["nenhuma_alternativa_correta"],
  "justificativa": "justificativa objetiva"
}
Use somente os problemas permitidos: gabarito_inconsistente, nenhuma_alternativa_correta,
multiplas_alternativas_corretas, enunciado_ambiguo, enunciado_insuficiente,
explicacao_inconsistente, alternativa_duplicada, erro_logico, erro_matematico,
erro_factual ou outro.
`.trim()
}

export function isSemanticValidationApproved(
  result: SemanticValidation,
  expectedAnswer?: GeneratedQuestion['gabarito'],
): boolean {
  return result.valida
    && result.confianca === 'alta'
    && result.enunciado_suficiente
    && result.alternativa_correta_existe
    && !result.multiplas_corretas
    && result.explicacao_consistente
    && result.gabarito_calculado !== null
    && result.gabarito_calculado === result.gabarito_informado
    && (expectedAnswer === undefined || result.gabarito_informado === expectedAnswer)
    && result.problemas.length === 0
}

export async function validateGeneratedQuestion(
  input: SemanticQuestionInput,
  providers?: QuestionProviders,
  stage: Extract<AiJsonStage, 'semantic_validation' | 'semantic_revalidation'> = 'semantic_validation',
): Promise<{ result: SemanticValidation; provider: AiProvider }> {
  const { rawResponse, provider, metadata } = await generateJsonWithFallback(
    buildSemanticValidationPrompt(input), providers,
    { temperature: 0.1, maxOutputTokens: 2048, operation: 'validação semântica', stage },
  )
  const parsed = semanticValidationSchema.safeParse(parseAiJson(rawResponse, stage, provider, metadata))
  if (!parsed.success) throw new Error(`${provider} retornou validação semântica fora do formato esperado.`)
  return { result: parsed.data, provider }
}

export function buildQuestionCorrectionPrompt(
  input: SemanticQuestionInput,
  validation: SemanticValidation,
): string {
  return `
Corrija UMA questão de concurso reprovada por validação semântica independente.
Preserve disciplina, assunto, subassunto, banca, dificuldade e objetivo temático.
Pode corrigir enunciado, alternativas, gabarito e explicação.
Problemas detectados: ${validation.problemas.join(', ') || 'inconsistência semântica'}.
Justificativa do validador: ${validation.justificativa}

${questionText(input)}

Retorne SOMENTE JSON com enunciado, alternativa_a, alternativa_b, alternativa_c,
alternativa_d, alternativa_e, gabarito e explicacao. Deve existir exatamente uma alternativa correta.
`.trim()
}

export async function correctGeneratedQuestion(
  input: SemanticQuestionInput,
  validation: SemanticValidation,
  providers?: QuestionProviders,
  questionNumber?: number,
): Promise<GeneratedQuestion> {
  const { rawResponse, provider, metadata } = await generateJsonWithFallback(
    buildQuestionCorrectionPrompt(input, validation), providers,
    { temperature: 0.2, maxOutputTokens: 4096, operation: 'correção semântica', stage: 'question_correction' },
  )
  const parsed = generatedQuestionSchema.safeParse(
    parseAiJson(rawResponse, 'question_correction', provider, metadata),
  )
  if (!parsed.success) throw new Error(`${provider} retornou correção fora do formato esperado.`)
  console.info(`[AI][question_correction][${provider}]${questionNumber ? `[question=${questionNumber}]` : ''} completed`)
  return parsed.data
}

export interface SemanticValidationSummary {
  analisadas: number
  enviadas_correcao: number
  rejeitadas_validacao: number
  // Campos legados preservados para consumidores já existentes.
  geradas: number
  aprovadas_primeira_validacao: number
  corrigidas_e_aprovadas: number
  rejeitadas: number
}

export interface RejectedGeneratedQuestion {
  numero_questao: number
  status: 'rejeitada_validacao'
  problemas: SemanticProblem[]
}

export interface IndividualValidationResult {
  numero_questao: number
  questao_id: number | null
  status_validacao: SemanticValidationStatus
  status?: 'cadastrada' | 'duplicada' | 'erro'
  problemas?: SemanticProblem[]
  problemas_correcao?: SemanticProblem[]
}

export interface ValidationWorkflowDependencies {
  validate?: (
    input: SemanticQuestionInput,
    providers?: QuestionProviders,
    stage?: Extract<AiJsonStage, 'semantic_validation' | 'semantic_revalidation'>,
  ) => ReturnType<typeof validateGeneratedQuestion>
  correct?: typeof correctGeneratedQuestion
}

export async function validateAndCorrectGeneratedQuestions(
  questions: GeneratedQuestion[],
  context: SemanticQuestionContext,
  providers?: QuestionProviders,
  dependencies: ValidationWorkflowDependencies = {},
): Promise<{ questoes: GeneratedQuestion[]; validacao: SemanticValidationSummary; rejeicoes: RejectedGeneratedQuestion[]; resultados: IndividualValidationResult[] }> {
  const validate = dependencies.validate ?? validateGeneratedQuestion
  const correct = dependencies.correct ?? correctGeneratedQuestion
  const approved: GeneratedQuestion[] = []
  const rejections: RejectedGeneratedQuestion[] = []
  const individualResults: IndividualValidationResult[] = []
  let firstPass = 0
  let correctedPass = 0
  let sentToCorrection = 0

  for (let index = 0; index < questions.length; index += 1) {
    const original = questions[index]
    const first = await validate({ ...context, questao: original }, providers, 'semantic_validation')
    if (isSemanticValidationApproved(first.result, original.gabarito)) {
      console.info(`[AI][semantic_validation][${first.provider}][question=${index + 1}] approved`)
      approved.push(original)
      individualResults.push({ numero_questao: index + 1, questao_id: null, status_validacao: 'aprovada_diretamente' })
      firstPass += 1
      continue
    }

    console.info(`[AI][semantic_validation][${first.provider}][question=${index + 1}] rejected`)
    sentToCorrection += 1
    const corrected = await correct({ ...context, questao: original }, first.result, providers, index + 1)
    const second = await validate({ ...context, questao: corrected }, providers, 'semantic_revalidation')
    if (isSemanticValidationApproved(second.result, corrected.gabarito)) {
      console.info(`[AI][semantic_revalidation][${second.provider}][question=${index + 1}] approved`)
      approved.push(corrected)
      individualResults.push({
        numero_questao: index + 1,
        questao_id: null,
        status_validacao: 'corrigida_e_aprovada',
        problemas_correcao: first.result.problemas,
      })
      correctedPass += 1
      continue
    }

    console.info(`[AI][semantic_revalidation][${second.provider}][question=${index + 1}] rejected`)
    rejections.push({ numero_questao: index + 1, status: 'rejeitada_validacao', problemas: second.result.problemas })
    individualResults.push({
      numero_questao: index + 1,
      questao_id: null,
      status_validacao: 'rejeitada_validacao',
      problemas: second.result.problemas,
      problemas_correcao: first.result.problemas,
    })
  }

  return {
    questoes: approved,
    validacao: {
      analisadas: questions.length,
      enviadas_correcao: sentToCorrection,
      rejeitadas_validacao: rejections.length,
      geradas: questions.length,
      aprovadas_primeira_validacao: firstPass,
      corrigidas_e_aprovadas: correctedPass,
      rejeitadas: rejections.length,
    },
    rejeicoes: rejections,
    resultados: individualResults.sort((left, right) => left.numero_questao - right.numero_questao),
  }
}

export async function validateBeforePersistence<T>(
  questions: GeneratedQuestion[],
  context: SemanticQuestionContext,
  persist: (approvedQuestions: GeneratedQuestion[]) => Promise<T>,
  providers?: QuestionProviders,
  dependencies: ValidationWorkflowDependencies = {},
): Promise<{
  questoes: GeneratedQuestion[]
  validacao: SemanticValidationSummary
  rejeicoes: RejectedGeneratedQuestion[]
  resultados: IndividualValidationResult[]
  persistencia: T | null
}> {
  const semantic = await validateAndCorrectGeneratedQuestions(
    questions,
    context,
    providers,
    dependencies,
  )

  // Com lote integralmente reprovado, nem a camada de persistência é acionada.
  const persistence = semantic.questoes.length > 0
    ? await persist(semantic.questoes)
    : null

  const persistenceResults = getPersistenceResults(persistence)
  let approvedIndex = 0
  const resultados = semantic.resultados.map((result) => {
    if (result.status_validacao === 'rejeitada_validacao') return result
    const persisted = persistenceResults[approvedIndex]
    approvedIndex += 1
    return persisted
      ? { ...result, questao_id: persisted.questao_id, status: persisted.status }
      : result
  })

  return { ...semantic, resultados, persistencia: persistence }
}

function getPersistenceResults(value: unknown): Array<{
  questao_id: number | null
  status: 'cadastrada' | 'duplicada' | 'erro'
}> {
  if (!value || typeof value !== 'object' || !('resultados' in value)) return []
  const results = (value as { resultados?: unknown }).resultados
  if (!Array.isArray(results)) return []
  return results.filter((item): item is { questao_id: number | null; status: 'cadastrada' | 'duplicada' | 'erro' } => {
    if (!item || typeof item !== 'object') return false
    const candidate = item as { questao_id?: unknown; status?: unknown }
    return (candidate.questao_id === null || Number.isSafeInteger(candidate.questao_id))
      && ['cadastrada', 'duplicada', 'erro'].includes(String(candidate.status))
  })
}
