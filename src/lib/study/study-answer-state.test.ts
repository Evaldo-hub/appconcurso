import assert from 'node:assert/strict'
import test from 'node:test'
import { beginStudyAnswer, confirmStudyAnswer, emptyStudyAnswerState, failStudyAnswer, selectStudyAnswer, summarizeStudyAnswers } from './study-answer-state'

const confirmed = { correct: true, correctAnswer: 'B' as const, explanation: 'Explicação', sources: [{ titulo: 'Material', pagina: 3 }] }

test('estado inicial não contém gabarito, explicação ou fontes', () => {
  assert.deepEqual(emptyStudyAnswerState(), { selected: null, pending: false, confirmed: null, error: null })
})

test('selecionar alternativa não revela resultado', () => {
  assert.deepEqual(selectStudyAnswer('A'), { selected: 'A', pending: false, confirmed: null, error: null })
})

test('submit entra em pending e segundo início não altera o estado', () => {
  const pending = beginStudyAnswer(selectStudyAnswer('B'))
  assert.equal(pending.pending, true)
  assert.equal(beginStudyAnswer(pending), pending)
})

test('sucesso confirmado revela resultado, explicação e fontes', () => {
  const state = confirmStudyAnswer(beginStudyAnswer(selectStudyAnswer('B')), confirmed)
  assert.deepEqual(state.confirmed, confirmed)
  assert.equal(state.pending, false)
})

test('falha não revela gabarito e permite retry', () => {
  const failed = failStudyAnswer(beginStudyAnswer(selectStudyAnswer('A')), 'Tente novamente')
  assert.equal(failed.confirmed, null)
  assert.equal(failed.pending, false)
  assert.equal(beginStudyAnswer(failed).pending, true)
})

test('estados independentes permanecem associados à questão ao navegar', () => {
  const answers = { 221: confirmStudyAnswer(selectStudyAnswer('B'), confirmed), 222: selectStudyAnswer('C') }
  assert.equal(answers[221].confirmed?.correct, true)
  assert.equal(answers[222].confirmed, null)
})

test('resumo considera somente respostas confirmadas pelo servidor', () => {
  const answers = { 221: confirmStudyAnswer(selectStudyAnswer('B'), confirmed), 222: selectStudyAnswer('C'), 223: beginStudyAnswer(selectStudyAnswer('A')) }
  assert.deepEqual(summarizeStudyAnswers([221, 222, 223], answers), { answered: 1, correct: 1, incorrect: 0, pending: 2 })
})
