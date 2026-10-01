import assert from 'node:assert/strict'
import test from 'node:test'
import { contentRowsMatch } from './compare'

const current = { ativo: true, disciplina_ordem: 1, assunto_ordem: 2, subassunto_ordem: null }

test('diferença somente no campo legado ordem não participa da comparação', () => {
  const expected = { ...current, ordem: 2 }
  const database = { ...current, ordem: 102 }
  assert.equal(contentRowsMatch(database, expected), true)
})

test('diferença em disciplina_ordem exige atualização', () => {
  assert.equal(contentRowsMatch(current, { ...current, disciplina_ordem: 2 }), false)
})

test('diferença em assunto_ordem exige atualização', () => {
  assert.equal(contentRowsMatch(current, { ...current, assunto_ordem: 3 }), false)
})

test('diferença em ativo exige atualização', () => {
  assert.equal(contentRowsMatch(current, { ...current, ativo: false }), false)
})
