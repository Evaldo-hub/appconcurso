import assert from 'node:assert/strict'
import test from 'node:test'

import type { ContestManifest, ManifestDiscipline } from '@/lib/contest-manifest/types'
import { createCatalogCanonicalKey } from '@/lib/contest-catalog/canonical-key'
import { parseNormalizedManifestText, prepareNormalizedBootstrap } from './prepare'

const discipline = (name: string, subject: string): ManifestDiscipline => ({
  disciplina: name,
  ordem: 1,
  ativo: true,
  assuntos: [{ assunto: subject, ordem: 1, ativo: true, subassuntos: [] }],
})

function fixture(): ContestManifest {
  return {
    schema_version: 1,
    slug: 'trt8-2026',
    nome: 'TRT8 - CONCURSO 2026',
    orgao: 'TRT8',
    banca: 'Fundação Carlos Chagas - FCC',
    ano: 2026,
    edital: 'Edital Nº 01/2026 de Abertura de Inscrições',
    data_prova: '2027-01-17',
    descricao: null,
    materiais: [],
    conteudos_comuns: [{ codigo: 'BASICO', nome: 'Básico', ativo: true, disciplinas: [discipline('Língua Portuguesa', 'Interpretação')] }],
    provas: [
      { codigo: 'P01', nome: 'Prova 1', cargo: 'Cargo 1', especialidade: null, turno: null, arquivo_origem: null, ativo: true, conteudos_comuns: ['BASICO'], conteudo_programatico: [discipline('Direito', 'Constituição')] },
      { codigo: 'P02', nome: 'Prova 2', cargo: 'Cargo 2', especialidade: 'TI', turno: null, arquivo_origem: null, ativo: true, conteudos_comuns: ['BASICO'], conteudo_programatico: [] },
    ],
  }
}

test('duas provas compartilham catálogo e conteúdo específico fica em uma prova', () => {
  const result = prepareNormalizedBootstrap(fixture())
  const portugueseSubject = createCatalogCanonicalKey({ disciplina: 'Língua Portuguesa', assunto: 'Interpretação', subassunto: null })
  const specificSubject = createCatalogCanonicalKey({ disciplina: 'Direito', assunto: 'Constituição', subassunto: null })
  assert.equal(result.plan.catalog.filter((row) => row.canonicalKey === portugueseSubject).length, 1)
  assert.equal(result.plan.links.filter((row) => row.canonicalKey === portugueseSubject).length, 2)
  assert.deepEqual(result.plan.links.filter((row) => row.canonicalKey === specificSubject).map((row) => row.examCode), ['P01'])
})

test('caixa e espaços convergem; conteúdo diferente não converge', () => {
  const first = createCatalogCanonicalKey({ disciplina: ' Língua   Portuguesa ', assunto: ' Texto ', subassunto: null })
  const second = createCatalogCanonicalKey({ disciplina: 'língua portuguesa', assunto: 'texto', subassunto: null })
  const different = createCatalogCanonicalKey({ disciplina: 'língua portuguesa', assunto: 'texto legal', subassunto: null })
  assert.equal(first, second)
  assert.notEqual(first, different)
})

test('parser ignora concurso_id legado e aceita schema_version 1.0', () => {
  const source = JSON.stringify({ ...fixture(), schema_version: '1.0', concurso_id: 11 })
  const parsed = parseNormalizedManifestText(source)
  assert.equal(parsed.success, true)
  if (parsed.success) {
    assert.equal(parsed.legacyContestIdIgnored, true)
    assert.equal(parsed.data.slug, 'trt8-2026')
  }
})

test('código de prova duplicado é erro estrutural do parser', () => {
  const value = fixture()
  value.provas[1].codigo = value.provas[0].codigo
  const parsed = parseNormalizedManifestText(JSON.stringify(value))
  assert.equal(parsed.success, false)
})

test('subassunto sem assunto é rejeitado pelo canonical-v1', () => {
  assert.throws(
    () => createCatalogCanonicalKey({ disciplina: 'Direito', assunto: null, subassunto: 'Constituição' }),
    /Subassunto exige assunto/,
  )
})

test('o mesmo manifesto produz o mesmo plano idempotente', () => {
  assert.deepEqual(prepareNormalizedBootstrap(fixture()).plan, prepareNormalizedBootstrap(fixture()).plan)
})
