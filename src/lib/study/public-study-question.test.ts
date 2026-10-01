import assert from 'node:assert/strict'
import test from 'node:test'
import { createStudyQuestionLoader, parseStudyQuestionId, toPublicStudyQuestion } from './public-study-question'

const row = { id: 221, disciplina: 'Administração', assunto: 'Planejamento', subassunto: null, banca: 'Cebraspe', dificuldade: 'Média', enunciado: 'Enunciado', alternativa_a: 'A1', alternativa_b: 'B1', alternativa_c: 'C1', alternativa_d: 'D1', alternativa_e: 'E1', gabarito: 'B', explicacao: 'Segredo', hash_questao: 'hash', fontes: ['segredo'] }

test('ID válido é aceito e IDs inválidos são recusados antes da consulta', () => {
  assert.equal(parseStudyQuestionId('221'), 221)
  for (const value of ['abc', '-1', '0', '1.5', '999999999999999999999']) assert.equal(parseStudyQuestionId(value), null)
})

test('questão existente produz DTO público explícito', async () => {
  const question = await createStudyQuestionLoader(async () => row)(221)
  assert.equal(question?.id, 221)
  assert.deepEqual(question?.alternativas, { A: 'A1', B: 'B1', C: 'C1', D: 'D1', E: 'E1' })
})

test('questão inexistente retorna null', async () => {
  assert.equal(await createStudyQuestionLoader(async () => null)(999), null)
})

test('DTO não propaga gabarito, explicação, fontes ou IDs internos por spread', () => {
  const question = toPublicStudyQuestion(row)
  assert.equal('gabarito' in question, false)
  assert.equal('explicacao' in question, false)
  assert.equal('fontes' in question, false)
  assert.equal('hash_questao' in question, false)
  assert.deepEqual(Object.keys(question).sort(), ['alternativas', 'assunto', 'banca', 'dificuldade', 'disciplina', 'enunciado', 'id', 'subassunto'].sort())
})
