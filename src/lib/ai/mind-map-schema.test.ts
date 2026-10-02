import assert from 'node:assert/strict'
import test from 'node:test'
import { mindMapSchema, parseMindMapContent } from './mind-map-schema'

const validMap = {
  titulo: 'Gestão de processos',
  descricao: 'Síntese visual baseada nas fontes.',
  ramos: [
    { titulo: 'Estratégia', icone: 'target', itens: [{ titulo: 'Objetivo', descricao: 'Direciona a atuação institucional.' }] },
    { titulo: 'Processos', icone: 'workflow', itens: [{ titulo: 'Fluxo', descricao: 'Organiza as etapas relacionadas.' }] },
  ],
  memorizar: ['Primeiro ponto.', 'Segundo ponto.', 'Terceiro ponto.'],
}

test('schema aceita mapa visual válido', () => {
  assert.equal(mindMapSchema.safeParse(validMap).success, true)
  assert.deepEqual(parseMindMapContent(JSON.stringify(validMap)), validMap)
})

test('schema rejeita estrutura, limites de ramos, itens e memorizar inválidos', () => {
  assert.equal(mindMapSchema.safeParse({ ...validMap, titulo: '' }).success, false)
  assert.equal(mindMapSchema.safeParse({ ...validMap, ramos: validMap.ramos.slice(0, 1) }).success, false)
  assert.equal(mindMapSchema.safeParse({ ...validMap, ramos: Array(9).fill(validMap.ramos[0]) }).success, false)
  assert.equal(mindMapSchema.safeParse({ ...validMap, ramos: [{ ...validMap.ramos[0], itens: [] }, validMap.ramos[1]] }).success, false)
  assert.equal(mindMapSchema.safeParse({ ...validMap, ramos: [{ ...validMap.ramos[0], itens: Array(9).fill(validMap.ramos[0].itens[0]) }, validMap.ramos[1]] }).success, false)
  assert.equal(mindMapSchema.safeParse({ ...validMap, memorizar: ['a', 'b'] }).success, false)
  assert.equal(mindMapSchema.safeParse({ ...validMap, memorizar: Array(8).fill('ponto') }).success, false)
})

test('schema rejeita HTML arbitrário e aplica fallback seguro de ícone', () => {
  assert.equal(mindMapSchema.safeParse({ ...validMap, descricao: '<script>alert(1)</script>' }).success, false)
  const parsed = mindMapSchema.parse({ ...validMap, ramos: [{ ...validMap.ramos[0], icone: 'qualquer-html' }, validMap.ramos[1]] })
  assert.equal(parsed.ramos[0].icone, 'brain')
})

test('parser retorna null para texto antigo e JSON inválido', () => {
  assert.equal(parseMindMapContent('TEMA\n├── RAMO'), null)
  assert.equal(parseMindMapContent('{invalido'), null)
})
