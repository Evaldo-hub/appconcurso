import { z } from 'zod'
import {
  defaultQuestionProviders,
  generateJsonWithFallback,
  type QuestionProviders,
} from './provider-fallback'

const conceptSchema = z.object({
  nome: z.string().trim().min(2).max(200),
  ocorrencias: z.number().int().positive().max(20),
}).strict()

export const historicalConceptMapSchema = z.object({
  conceitos: z.array(conceptSchema).max(20),
}).strict()

export interface HistoricalConcept { nome: string; ocorrencias: number }
export interface HistoricalConceptMap { conceitos: HistoricalConcept[] }

interface HistoricalConceptMapInput {
  disciplina: string
  assunto: string
  enunciados: string[]
}

export function normalizeConceptName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function aggregateConcepts(concepts: HistoricalConcept[]): HistoricalConcept[] {
  const totals = new Map<string, number>()
  concepts.forEach((concept) => {
    const name = normalizeConceptName(concept.nome)
    totals.set(name, (totals.get(name) ?? 0) + concept.ocorrencias)
  })
  return [...totals.entries()]
    .map(([nome, ocorrencias]) => ({ nome, ocorrencias }))
    .sort((left, right) => right.ocorrencias - left.ocorrencias || left.nome.localeCompare(right.nome, 'pt-BR'))
}

function classifierPrompt(input: HistoricalConceptMapInput): string {
  return `
Classifique conceitualmente questões de concurso em uma única análise.

DISCIPLINA: ${input.disciplina}
ASSUNTO: ${input.assunto}

QUESTÕES HISTÓRICAS:
${input.enunciados.map((statement, index) => `${index + 1}. ${statement}`).join('\n')}

Identifique exatamente um conceito central por questão e agrupe conceitos semanticamente equivalentes sob um nome canônico curto.
Não use lista predefinida. Derive os conceitos exclusivamente dos enunciados.
A soma de "ocorrencias" deve ser exatamente ${input.enunciados.length}.
Retorne somente JSON, sem Markdown ou explicações:
{"conceitos":[{"nome":"conceito canônico","ocorrencias":1}]}
`.trim()
}

export async function buildHistoricalConceptMap(
  input: HistoricalConceptMapInput,
  providers: QuestionProviders = defaultQuestionProviders,
): Promise<HistoricalConceptMap> {
  if (input.enunciados.length === 0) return { conceitos: [] }
  const { rawResponse } = await generateJsonWithFallback(classifierPrompt(input), providers, {
    temperature: 0.1, maxOutputTokens: 2048, operation: 'classificação conceitual',
  })
  let parsed: unknown
  try { parsed = JSON.parse(rawResponse) } catch { throw new Error('O classificador conceitual retornou JSON inválido.') }
  const validated = historicalConceptMapSchema.safeParse(parsed)
  if (!validated.success) throw new Error(`Mapa conceitual inválido: ${validated.error.issues[0]?.message ?? 'estrutura inválida'}`)
  const total = validated.data.conceitos.reduce((sum, concept) => sum + concept.ocorrencias, 0)
  if (total !== input.enunciados.length) throw new Error(`Mapa conceitual incoerente: ${total} ocorrências para ${input.enunciados.length} questões.`)
  return { conceitos: aggregateConcepts(validated.data.conceitos) }
}

export async function tryBuildHistoricalConceptMap(
  input: HistoricalConceptMapInput,
  providers: QuestionProviders = defaultQuestionProviders,
): Promise<HistoricalConceptMap> {
  try {
    return await buildHistoricalConceptMap(input, providers)
  } catch (error) {
    console.warn('[AI] Classificação conceitual indisponível; geração continuará sem mapa.', error instanceof Error ? error.message : 'Erro desconhecido')
    return { conceitos: [] }
  }
}
