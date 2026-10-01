import type { AnswerLetter, ConfirmedStudyAnswer } from './submit-study-answer'

export interface StudyAnswerState {
  selected: AnswerLetter | null
  pending: boolean
  confirmed: ConfirmedStudyAnswer | null
  error: string | null
}

export const emptyStudyAnswerState = (): StudyAnswerState => ({ selected: null, pending: false, confirmed: null, error: null })

export const selectStudyAnswer = (selected: AnswerLetter): StudyAnswerState => ({ selected, pending: false, confirmed: null, error: null })

export const beginStudyAnswer = (state: StudyAnswerState): StudyAnswerState => state.selected && !state.pending && !state.confirmed
  ? { ...state, pending: true, error: null }
  : state

export const confirmStudyAnswer = (state: StudyAnswerState, confirmed: ConfirmedStudyAnswer): StudyAnswerState => ({ ...state, pending: false, confirmed, error: null })

export const failStudyAnswer = (state: StudyAnswerState, error: string): StudyAnswerState => ({ ...state, pending: false, confirmed: null, error })

export function summarizeStudyAnswers(questionIds: number[], answers: Record<number, StudyAnswerState>) {
  const confirmed = questionIds.flatMap((id) => answers[id]?.confirmed ? [answers[id].confirmed] : [])
  const correct = confirmed.filter((answer) => answer.correct).length
  return { answered: confirmed.length, correct, incorrect: confirmed.length - correct, pending: questionIds.length - confirmed.length }
}
