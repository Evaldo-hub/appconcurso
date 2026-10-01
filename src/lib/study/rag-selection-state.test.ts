import assert from 'node:assert/strict'
import test from 'node:test'
import {
  initialRagStudySelection,
  canSubmitStudySelection,
  evaluateStudyAnswer,
  selectContest,
  selectDiscipline,
  selectExam,
  selectSubject,
} from './rag-selection-state'

const selected = {
  contestId: '7', examId: '10', discipline: 'Disciplina', subject: 'Assunto', subsubject: 'Subassunto', amount: 5 as const,
}

test('alterar concurso limpa todos os níveis inferiores', () => {
  assert.deepEqual(selectContest(selected, '8'), { ...initialRagStudySelection, contestId: '8' })
})

test('alterar prova preserva prova_id e limpa disciplina, assunto e subassunto', () => {
  assert.deepEqual(selectExam(selected, '10'), { ...initialRagStudySelection, contestId: '7', examId: '10' })
})

test('alterar disciplina limpa assunto e subassunto', () => {
  assert.deepEqual(selectDiscipline(selected, 'Nova'), { ...selected, discipline: 'Nova', subject: '', subsubject: '' })
})

test('alterar assunto limpa subassunto', () => {
  assert.deepEqual(selectSubject(selected, 'Novo'), { ...selected, subject: 'Novo', subsubject: '' })
})

test('submissão exige seleção completa e fica bloqueada durante pending', () => {
  assert.equal(canSubmitStudySelection(initialRagStudySelection), false)
  assert.equal(canSubmitStudySelection(selected), true)
  assert.equal(canSubmitStudySelection(selected, true), false)
})

test('correção local compara a alternativa somente após uma seleção', () => {
  assert.equal(evaluateStudyAnswer(null, 'B'), false)
  assert.equal(evaluateStudyAnswer('A', 'B'), false)
  assert.equal(evaluateStudyAnswer('B', 'B'), true)
})
