export interface RagStudySelectionState {
  contestId: string
  examId: string
  discipline: string
  subject: string
  subsubject: string
  amount: 1 | 5 | 10
}

export const initialRagStudySelection: RagStudySelectionState = {
  contestId: '',
  examId: '',
  discipline: '',
  subject: '',
  subsubject: '',
  amount: 5,
}

export function selectContest(state: RagStudySelectionState, contestId: string): RagStudySelectionState {
  return { ...state, contestId, examId: '', discipline: '', subject: '', subsubject: '' }
}

export function selectExam(state: RagStudySelectionState, examId: string): RagStudySelectionState {
  return { ...state, examId, discipline: '', subject: '', subsubject: '' }
}

export function selectDiscipline(state: RagStudySelectionState, discipline: string): RagStudySelectionState {
  return { ...state, discipline, subject: '', subsubject: '' }
}

export function selectSubject(state: RagStudySelectionState, subject: string): RagStudySelectionState {
  return { ...state, subject, subsubject: '' }
}

export function canSubmitStudySelection(state: RagStudySelectionState, pending = false) {
  return Boolean(state.contestId && state.examId && state.discipline && state.subject) && !pending
}

export function evaluateStudyAnswer(selected: string | null, answer: string) {
  return selected !== null && selected === answer
}
