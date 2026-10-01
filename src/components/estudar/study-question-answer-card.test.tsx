import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { StudyQuestionAnswerCard } from './study-question-answer-card'
import { confirmStudyAnswer, emptyStudyAnswerState, selectStudyAnswer } from '@/lib/study/study-answer-state'

const question = { id: 221, disciplina: 'Administração', assunto: 'Planejamento', subassunto: null, banca: 'Cebraspe', dificuldade: 'Média', enunciado: 'Enunciado público', alternativas: { A: 'Alternativa A', B: 'Alternativa B', C: 'Alternativa C', D: 'Alternativa D', E: 'Alternativa E' } }
const render = (state = emptyStudyAnswerState()) => renderToStaticMarkup(<StudyQuestionAnswerCard question={question} state={state} onSelect={() => {}} onAnswer={() => {}} />)

test('renderiza questão e alternativas A-E sem resposta, explicação ou fontes inicialmente', () => {
  const html = render()
  assert.match(html, /Enunciado público/)
  for (const letter of ['A', 'B', 'C', 'D', 'E']) assert.match(html, new RegExp(`value="${letter}"`))
  assert.doesNotMatch(html, /Gabarito:/)
  assert.doesNotMatch(html, /Explicação/)
  assert.doesNotMatch(html, /Fontes/)
})

test('seleção local não revela correção', () => {
  const html = render(selectStudyAnswer('A'))
  assert.doesNotMatch(html, /Resposta correta|Resposta incorreta|Gabarito:/)
})

test('somente sucesso server-side revela correção, gabarito, explicação e fontes', () => {
  const html = render(confirmStudyAnswer(selectStudyAnswer('B'), { correct: true, correctAnswer: 'B', explanation: 'Explicação confirmada', sources: [{ titulo: 'Material confirmado', pagina: 3 }] }))
  assert.match(html, /Resposta correta/)
  assert.match(html, /Gabarito:/)
  assert.match(html, /Explicação confirmada/)
  assert.match(html, /Material confirmado/)
})
