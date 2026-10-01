import assert from 'node:assert/strict'
import test from 'node:test'
import { expandContestManifest } from './expand'
import type { ContestManifest, ManifestDiscipline } from './types'

function manifestWith(discipline: ManifestDiscipline): ContestManifest {
  return {
    schema_version: 1, slug: 'teste-2026', nome: 'Teste', orgao: 'Órgão', banca: 'Banca', ano: 2026, edital: null, data_prova: null, descricao: null, conteudos_comuns: [], materiais: [],
    provas: [{ codigo: 'C01', nome: 'Prova', cargo: 'Cargo', especialidade: null, turno: null, arquivo_origem: null, ativo: true, conteudos_comuns: [], conteudo_programatico: [discipline] }],
  }
}

test('disciplina sem assuntos produz exatamente uma linha-base', () => {
  const result = expandContestManifest(manifestWith({ disciplina: 'Português', ordem: 1, ativo: true, assuntos: [] }))
  assert.deepEqual(result.conteudos, [{ prova_codigo: 'C01', disciplina: 'Português', assunto: null, subassunto: null, ordem: 1, ativo: true, disciplina_ordem: 1, assunto_ordem: null, subassunto_ordem: null }])
})

test('disciplina com assunto produz linha-base e linha do assunto', () => {
  const result = expandContestManifest(manifestWith({ disciplina: 'Português', ordem: 1, ativo: true, assuntos: [{ assunto: 'Ortografia', ordem: 2, ativo: true, subassuntos: [] }] }))
  assert.equal(result.conteudos.length, 2)
  assert.equal(result.conteudos[0].assunto, null)
  assert.deepEqual(result.conteudos[1], { prova_codigo: 'C01', disciplina: 'Português', assunto: 'Ortografia', subassunto: null, ordem: 2, ativo: true, disciplina_ordem: 1, assunto_ordem: 2, subassunto_ordem: null })
})

test('disciplina com subassuntos produz linha-base, assunto e subassuntos', () => {
  const result = expandContestManifest(manifestWith({ disciplina: 'Português', ordem: 1, ativo: true, assuntos: [{ assunto: 'Ortografia', ordem: 2, ativo: true, subassuntos: [{ subassunto: 'Acentuação', ordem: 1, ativo: true }, { subassunto: 'Hífen', ordem: 2, ativo: false }] }] }))
  assert.equal(result.conteudos.length, 4)
  assert.deepEqual(result.conteudos.map((row) => [row.assunto, row.subassunto]), [[null, null], ['Ortografia', null], ['Ortografia', 'Acentuação'], ['Ortografia', 'Hífen']])
  assert.equal(result.conteudos[3].ativo, false)
})
