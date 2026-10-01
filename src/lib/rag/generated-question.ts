import 'server-only'

import { z } from 'zod'
import type { RagGenerationContext, RagGenerationSource } from './generation-context'

const nonEmptyText = z.string().trim().min(1)
const answerLetterSchema = z.enum(['A', 'B', 'C', 'D', 'E'])

export const ragGeneratedQuestionSchema = z.object({
  numeroQuestao: z.number().int().positive(),
  disciplina: nonEmptyText,
  assunto: nonEmptyText,
  subassunto: nonEmptyText.nullable(),
  banca: nonEmptyText,
  dificuldade: z.enum(['facil', 'media', 'dificil']),
  enunciado: nonEmptyText,
  alternativas: z.object({
    A: nonEmptyText,
    B: nonEmptyText,
    C: nonEmptyText,
    D: nonEmptyText,
    E: nonEmptyText,
  }).strict(),
  gabarito: answerLetterSchema,
  explicacao: nonEmptyText,
  sourceIndexes: z.array(z.number().int().positive()).min(1).superRefine((indexes, context) => {
    if (new Set(indexes).size !== indexes.length) context.addIssue({ code: 'custom', message: 'sourceIndexes não pode conter duplicatas.' })
  }),
}).strict()

export type RagGeneratedQuestion = z.infer<typeof ragGeneratedQuestionSchema>
export type ResolvedGeneratedQuestionSource = RagGenerationSource

export interface SourceCitationIntegrityResult {
  valid: boolean
  referencedSourceIndexes: number[]
  undeclaredReferencedSources: number[]
  declaredButNotTextuallyReferenced: number[]
}

export function extractReferencedSourceIndexes(text: string): number[] {
  const indexes = new Set<number>()
  for (const match of text.matchAll(/\[\s*fonte\s+(\d+)\s*\]/giu)) indexes.add(Number(match[1]))
  return [...indexes].sort((left, right) => left - right)
}

export function validateSourceCitationIntegrity(question: RagGeneratedQuestion): SourceCitationIntegrityResult {
  const text = [question.enunciado, ...Object.values(question.alternativas), question.explicacao].join('\n')
  const referencedSourceIndexes = extractReferencedSourceIndexes(text)
  const declared = new Set(question.sourceIndexes)
  const referenced = new Set(referencedSourceIndexes)
  const undeclaredReferencedSources = referencedSourceIndexes.filter((index) => !declared.has(index))
  const declaredButNotTextuallyReferenced = [...declared].filter((index) => !referenced.has(index)).sort((a, b) => a - b)
  return { valid: undeclaredReferencedSources.length === 0, referencedSourceIndexes, undeclaredReferencedSources, declaredButNotTextuallyReferenced }
}

function unwrapJsonFence(value: string) {
  const fenced = value.match(/^\s*```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/i)
  return fenced ? fenced[1] : value
}

export function parseRagGeneratedQuestion(value: unknown): RagGeneratedQuestion {
  let candidate = value
  if (typeof value === 'string') {
    try {
      candidate = JSON.parse(unwrapJsonFence(value))
    } catch {
      throw new Error('A resposta da IA não contém JSON válido para uma questão RAG.')
    }
  }
  const parsed = ragGeneratedQuestionSchema.safeParse(candidate)
  if (!parsed.success) throw new Error(`Questão RAG inválida: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`)
  return parsed.data
}

export function resolveGeneratedQuestionSources(
  question: RagGeneratedQuestion,
  context: RagGenerationContext,
): ResolvedGeneratedQuestionSource[] {
  if (!context.hasContext || context.sources.length === 0 || context.sourceCount === 0) {
    throw new Error('Não é possível resolver fontes de uma questão RAG sem contexto.')
  }
  return question.sourceIndexes.map((sourceIndex) => {
    const source = context.sources.find((item) => item.sourceIndex === sourceIndex)
    if (!source) throw new Error(`sourceIndex ${sourceIndex} não existe no contexto RAG.`)
    return { ...source }
  })
}
