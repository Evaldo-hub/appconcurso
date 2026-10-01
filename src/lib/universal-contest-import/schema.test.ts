import assert from 'node:assert/strict'
import test from 'node:test'
import { parseContestFileText, parseProgramFileText } from './schema'

const contest = { concurso_id: 9, nome: 'Concurso 2026', orgao: 'Órgão', banca: 'Banca', ano: 2026, edital: '001/2026', escopo: 'geral', observacao: null }
const program = { schema_version: '1.0', concurso_id: 9, provas: [{ codigo_prova: 'C01', cargo: 'Professor', especialidade: null, escolaridade: null, turno: null, disciplinas: [{ nome: 'Português', ordem: 1, assuntos: [{ nome: 'Interpretação', ordem: 1, subassuntos: [] }] }] }] }

test('aceita os dois JSONs válidos e campos opcionais null', () => {
  assert.equal(parseContestFileText(JSON.stringify(contest)).success, true)
  assert.equal(parseProgramFileText(JSON.stringify(program)).success, true)
})
test('rejeita JSON inválido', () => assert.equal(parseProgramFileText('{').success, false))
test('rejeita versão não suportada', () => assert.equal(parseProgramFileText(JSON.stringify({ ...program, schema_version: '2.0' })).success, false))
test('rejeita codigo_prova duplicado', () => {
  const value = { ...program, provas: [program.provas[0], structuredClone(program.provas[0])] }
  const result = parseProgramFileText(JSON.stringify(value))
  assert.equal(result.success, false)
  if (!result.success) assert.ok(result.errors.some((error) => error.path.includes('provas[1].codigo_prova')))
})
test('rejeita disciplina, assunto e subassunto estruturalmente duplicados', () => {
  const duplicate = structuredClone(program)
  duplicate.provas[0].disciplinas.push(structuredClone(duplicate.provas[0].disciplinas[0]))
  assert.equal(parseProgramFileText(JSON.stringify(duplicate)).success, false)
})
test('rejeita concurso_id acima de Number.MAX_SAFE_INTEGER', () => {
  assert.equal(parseContestFileText(JSON.stringify({ ...contest, concurso_id: Number.MAX_SAFE_INTEGER + 1 })).success, false)
  assert.equal(parseProgramFileText(JSON.stringify({ ...program, concurso_id: Number.MAX_SAFE_INTEGER + 1 })).success, false)
})
