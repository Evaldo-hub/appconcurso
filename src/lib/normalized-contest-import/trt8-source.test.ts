import assert from 'node:assert/strict'
import test from 'node:test'

import { parseTrt82026SourceText } from './trt8-source'

const valid = {
  schema_version: '1.0', concurso_id: 11, slug: 'trt8-2026', nome: 'TRT8 - CONCURSO 2026', orgao: 'TRT8',
  banca: 'Fundação Carlos Chagas - FCC', ano: 2026, edital: 'Edital Nº 01/2026 de Abertura de Inscrições',
  data_prova: '17/01/2027', descricao: null, conteudos_comuns: ['Língua Portuguesa'], materiais: [],
  provas: [{ codigo_prova: 'C01', cargo: 'Analista', especialidade: null, escolaridade: 'Superior', turno: 'Manhã', disciplinas: [{ nome: 'Língua Portuguesa', ordem: 1, assuntos: [{ nome: 'Texto', ordem: 1, subassuntos: [] }] }] }],
}

test('adapta o schema real sem usar concurso_id legado', () => {
  const result = parseTrt82026SourceText(JSON.stringify(valid))
  assert.equal(result.success, true)
  if (result.success) {
    assert.equal(result.legacyContestId, 11)
    assert.equal(result.manifest.slug, 'trt8-2026')
    assert.equal('concurso_id' in result.manifest, false)
    assert.equal(result.manifest.data_prova, '2027-01-17')
    assert.equal(result.examSchooling.get('C01'), 'Superior')
  }
})

test('não descarta campos desconhecidos', () => {
  const result = parseTrt82026SourceText(JSON.stringify({ ...valid, campo_desconhecido: true }))
  assert.equal(result.success, false)
})
