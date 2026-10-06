import 'server-only'

import { z } from 'zod'

export const studyQuestionInputSchema = z.object({
  concurso_id: z.coerce.number().int().positive(), prova_id: z.coerce.number().int().positive(),
  disciplina: z.string().trim().min(1).max(300), assunto: z.string().trim().min(1).max(300),
  subassunto: z.string().trim().max(300).transform((value) => value || null),
  quantidade: z.coerce.number().int().refine((value) => [1, 5, 10].includes(value)),
}).strict()

export type StudyQuestionInput = z.infer<typeof studyQuestionInputSchema>
export type StudyFlowErrorCode = 'AUTH_REQUIRED' | 'INVALID_RAG_SELECTION' | 'INVALID_QUANTITY' | 'NO_RAG_CONTEXT' | 'GENERATION_FAILED' | 'SEMANTIC_REJECTED' | 'PERSISTENCE_FAILED'
export interface SafeStudyQuestion {
  attempt: number; questao_id: number; status: 'created' | 'duplicate'; disciplina: string; assunto: string
  subassunto: string | null; banca: string; dificuldade: 'facil' | 'media' | 'dificil'; enunciado: string
  alternativas: Record<'A' | 'B' | 'C' | 'D' | 'E', string>
}
export interface StudyQuestionBatchResult {
  status: 'complete' | 'partial' | 'failed'; requestedQuantity: number; generatedCount: number; attempts: number
  questions: SafeStudyQuestion[]; duplicates: number; rejected: number; stoppedReason: string | null
}
export type StudyQuestionActionResult = { ok: true; batch: StudyQuestionBatchResult } | { ok: false; code: StudyFlowErrorCode }

export class StudyQuestionAttemptError extends Error {
  constructor(readonly code: 'REJECTED' | 'PROVIDER_FAILURE' | 'AI_PROVIDER_UNAVAILABLE' | 'PERSISTENCE_FAILURE') { super(code) }
}

export const maxBatchAttempts = (quantity: number) => quantity === 1 ? 1 : quantity === 5 ? 7 : quantity === 10 ? 13 : 0

export async function generateStudyQuestionBatch(quantity: number, generateOne: (attempt: number) => Promise<SafeStudyQuestion>): Promise<StudyQuestionBatchResult> {
  const maxAttempts = maxBatchAttempts(quantity)
  if (!maxAttempts) throw new Error('INVALID_QUANTITY')
  const questions: SafeStudyQuestion[] = []
  let attempts = 0; let rejected = 0; let stoppedReason: string | null = null
  while (attempts < maxAttempts && questions.length < quantity) {
    attempts += 1
    try { questions.push(await generateOne(attempts)) }
    catch (error) {
      const code = error instanceof StudyQuestionAttemptError ? error.code : 'PROVIDER_FAILURE'
      if (code === 'REJECTED') { rejected += 1; continue }
      stoppedReason = code; break
    }
  }
  const status = questions.length === quantity ? 'complete' : questions.length > 0 ? 'partial' : 'failed'
  return { status, requestedQuantity: quantity, generatedCount: questions.length, attempts, questions, duplicates: questions.filter((item) => item.status === 'duplicate').length, rejected, stoppedReason }
}

export interface StudyQuestionFlowDependencies {
  authenticate(): Promise<boolean>
  resolveSelection(input: StudyQuestionInput): Promise<{ valid: boolean; board: string }>
  executeBatch(input: StudyQuestionInput, board: string): Promise<StudyQuestionBatchResult>
}

export function createStudyQuestionFlow(dependencies: StudyQuestionFlowDependencies) {
  return async function generate(rawInput: unknown): Promise<StudyQuestionActionResult> {
    if (!(await dependencies.authenticate())) return { ok: false, code: 'AUTH_REQUIRED' }
    const rawQuantity = Number((rawInput as { quantidade?: unknown } | null)?.quantidade)
    if (![1, 5, 10].includes(rawQuantity)) return { ok: false, code: 'INVALID_QUANTITY' }
    const parsed = studyQuestionInputSchema.safeParse(rawInput)
    if (!parsed.success) return { ok: false, code: 'INVALID_RAG_SELECTION' }
    const selection = await dependencies.resolveSelection(parsed.data)
    if (!selection.valid || !selection.board) return { ok: false, code: 'INVALID_RAG_SELECTION' }
    try { return { ok: true, batch: await dependencies.executeBatch(parsed.data, selection.board) } }
    catch (error) { return { ok: false, code: mapStudyFlowError(error) } }
  }
}

export function mapStudyFlowError(error: unknown): StudyFlowErrorCode {
  const message = error instanceof Error ? error.message : ''
  if (message === 'NO_RAG_CONTEXT' || message === 'RAG_CONTEXT_NOT_FOUND') return 'NO_RAG_CONTEXT'
  if (message === 'PERSISTENCE_FAILURE') return 'PERSISTENCE_FAILED'
  return 'GENERATION_FAILED'
}
