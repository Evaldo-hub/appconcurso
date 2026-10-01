import type { SupabaseClient } from '@supabase/supabase-js'
import type { GeneratedQuestion, GeneratedQuestionWithDiversity } from './question-schema'
import { normalizeConceptName, type HistoricalConceptMap } from './historical-concept-map'

export const RECENT_QUESTIONS_LIMIT = 20
export const RECENT_STATEMENT_MAX_LENGTH = 600

export interface QuestionDiversityContext {
  concursoId: number
  provaId: number
  disciplina: string
  assunto: string
}

export async function fetchRecentQuestionStatements(admin: SupabaseClient, context: QuestionDiversityContext): Promise<string[]> {
  const { data, error } = await admin
    .from('questoes_estudo')
    .select('id, enunciado, gabarito')
    .eq('concurso_id', context.concursoId)
    .eq('prova_id', context.provaId)
    .eq('disciplina', context.disciplina)
    .eq('assunto', context.assunto)
    .order('criado_em', { ascending: false })
    .limit(RECENT_QUESTIONS_LIMIT)

  if (error) throw new Error(`Não foi possível consultar questões anteriores: ${error.message}`)

  return (data ?? [])
    .map((row) => typeof row.enunciado === 'string' ? truncateStatement(row.enunciado) : '')
    .filter(Boolean)
}

export function truncateStatement(statement: string): string {
  const normalized = statement.trim()
  if (normalized.length <= RECENT_STATEMENT_MAX_LENGTH) return normalized
  return `${normalized.slice(0, RECENT_STATEMENT_MAX_LENGTH - 1).trimEnd()}…`
}

export function normalizeQuestionStatement(statement: string): string {
  return statement.trim().toLowerCase().replace(/\s+/g, ' ')
}

export class DiversityValidationError extends Error {
  constructor(message: string, readonly repeatedConcepts: string[] = []) {
    super(message)
    this.name = 'DiversityValidationError'
  }
}

export interface SaturatedHistoricalConcept {
  nome: string
  historico: number
}

export interface HistoricalConceptDiversityResult {
  valid: boolean
  saturatedConcepts: SaturatedHistoricalConcept[]
}

export function validateHistoricalConceptDiversity(
  questions: GeneratedQuestionWithDiversity[],
  historicalMap: HistoricalConceptMap | undefined,
  narrowSubject = false,
): HistoricalConceptDiversityResult {
  if (narrowSubject || !historicalMap?.conceitos.length) return { valid: true, saturatedConcepts: [] }

  const leastExplored = Math.min(...historicalMap.conceitos.map((concept) => concept.ocorrencias))
  const saturated = new Map(
    historicalMap.conceitos
      .filter((concept) => concept.ocorrencias >= 2 && concept.ocorrencias > leastExplored)
      .map((concept) => [normalizeConceptName(concept.nome), concept] as const),
  )
  const matches = new Map<string, SaturatedHistoricalConcept>()
  for (const question of questions) {
    const concept = saturated.get(normalizeConceptName(question.conceito_central))
    if (concept) matches.set(normalizeConceptName(concept.nome), { nome: concept.nome, historico: concept.ocorrencias })
  }
  const saturatedConcepts = [...matches.values()]
  return { valid: saturatedConcepts.length === 0, saturatedConcepts }
}

export function assertHistoricalConceptDiversity(
  questions: GeneratedQuestionWithDiversity[],
  historicalMap: HistoricalConceptMap | undefined,
  narrowSubject = false,
): void {
  const result = validateHistoricalConceptDiversity(questions, historicalMap, narrowSubject)
  if (result.valid) return
  const details = result.saturatedConcepts
    .map((concept) => `${concept.nome} já apareceu ${concept.historico} vezes no histórico recente`)
    .join('; ')
  throw new DiversityValidationError(
    `${details}. Escolha outro conceito relevante e menos explorado do assunto, se houver.`,
    result.saturatedConcepts.map((concept) => concept.nome),
  )
}

export function assertUniqueQuestionBatch(questions: GeneratedQuestion[]): void {
  const seen = new Map<string, number>()
  questions.forEach((question, index) => {
    const normalized = normalizeQuestionStatement(question.enunciado)
    const previous = seen.get(normalized)
    if (previous !== undefined) throw new DiversityValidationError(`O lote contém enunciados repetidos nas posições ${previous + 1} e ${index + 1}.`)
    seen.set(normalized, index)
  })
}

export function assertConceptualDiversity(questions: GeneratedQuestionWithDiversity[], narrowSubject: boolean): void {
  if (questions.length <= 1) return
  const byConcept = new Map<string, GeneratedQuestionWithDiversity[]>()
  for (const question of questions) {
    const concept = normalizeQuestionStatement(question.conceito_central)
    byConcept.set(concept, [...(byConcept.get(concept) ?? []), question])
  }
  const repeated = [...byConcept.entries()].filter(([, items]) => items.length > 1)
  if (repeated.length === 0) return

  const narrowAndVaried = narrowSubject && repeated.every(([, items]) => {
    const approaches = new Set(items.map((item) => normalizeQuestionStatement(item.abordagem_cognitiva)))
    return approaches.size === items.length
  })
  if (narrowAndVaried) return

  const concepts = repeated.map(([concept]) => concept)
  throw new DiversityValidationError(`O lote repetiu conceitos centrais: ${concepts.join(', ')}.`, concepts)
}

const ANSWER_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const

export function createBalancedAnswerPlan(quantity: number, random: () => number = Math.random): string[] {
  const result: string[] = []
  while (result.length < quantity) {
    const cycle = [...ANSWER_LETTERS]
    for (let index = cycle.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1))
      ;[cycle[index], cycle[target]] = [cycle[target], cycle[index]]
    }
    result.push(...cycle.slice(0, Math.min(cycle.length, quantity - result.length)))
  }
  return result
}
