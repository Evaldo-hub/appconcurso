import 'server-only'

import { z } from 'zod'

const answerLetterSchema = z.enum(['A', 'B', 'C', 'D', 'E'])

export const submitStudyAnswerInputSchema = z.object({
  questao_id: z.coerce.number().int().positive(),
  alternativa_selecionada: answerLetterSchema,
  tempo_gasto: z.number().int().min(0).max(86_400).optional(),
}).strict()

export type AnswerLetter = z.infer<typeof answerLetterSchema>
export type SubmitStudyAnswerInput = z.infer<typeof submitStudyAnswerInputSchema>
export type StudyAnswerErrorCode = 'AUTH_REQUIRED' | 'INVALID_ANSWER_INPUT' | 'QUESTION_NOT_FOUND' | 'ANSWER_PERSISTENCE_FAILED'

export interface StudyAnswerQuestion {
  id: number
  correctAnswer: AnswerLetter
  explanation: string
}

export interface StudyAnswerSource { titulo: string; pagina: number | null }

export interface StudyAnswerPersistenceResult {
  respostaId: number
  correct: boolean
  correctAnswer: AnswerLetter
}

export interface ConfirmedStudyAnswer {
  correct: boolean
  correctAnswer: AnswerLetter
  explanation: string
  sources: StudyAnswerSource[]
}

export type SubmitStudyAnswerResult =
  | { ok: true; answer: ConfirmedStudyAnswer }
  | { ok: false; code: StudyAnswerErrorCode }

export interface SubmitStudyAnswerDependencies {
  authenticate(): Promise<{ userId: string } | null>
  findQuestion(questionId: number): Promise<StudyAnswerQuestion | null>
  findSources(questionId: number): Promise<StudyAnswerSource[]>
  persist(userId: string, input: SubmitStudyAnswerInput): Promise<StudyAnswerPersistenceResult>
}

export function createSubmitStudyAnswer(dependencies: SubmitStudyAnswerDependencies) {
  return async function submit(rawInput: unknown): Promise<SubmitStudyAnswerResult> {
    const session = await dependencies.authenticate()
    if (!session) return { ok: false, code: 'AUTH_REQUIRED' }

    const parsed = submitStudyAnswerInputSchema.safeParse(rawInput)
    if (!parsed.success) return { ok: false, code: 'INVALID_ANSWER_INPUT' }

    let question: StudyAnswerQuestion | null
    let sources: StudyAnswerSource[]
    try {
      question = await dependencies.findQuestion(parsed.data.questao_id)
      if (!question) return { ok: false, code: 'QUESTION_NOT_FOUND' }
      sources = await dependencies.findSources(parsed.data.questao_id)
    } catch {
      return { ok: false, code: 'ANSWER_PERSISTENCE_FAILED' }
    }

    const serverCalculatedCorrect = parsed.data.alternativa_selecionada === question.correctAnswer
    try {
      const persisted = await dependencies.persist(session.userId, parsed.data)
      if (
        !Number.isSafeInteger(persisted.respostaId)
        || persisted.respostaId <= 0
        || persisted.correct !== serverCalculatedCorrect
        || persisted.correctAnswer !== question.correctAnswer
      ) return { ok: false, code: 'ANSWER_PERSISTENCE_FAILED' }
    } catch {
      return { ok: false, code: 'ANSWER_PERSISTENCE_FAILED' }
    }

    return {
      ok: true,
      answer: {
        correct: serverCalculatedCorrect,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
        sources,
      },
    }
  }
}
