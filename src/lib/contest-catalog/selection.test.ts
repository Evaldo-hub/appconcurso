import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { prepareNormalizedBootstrap } from '@/lib/normalized-contest-import/prepare'
import { parseTrt82026SourceText } from '@/lib/normalized-contest-import/trt8-source'
import {
  buildNormalizedSelectionTaxonomy,
  listarAssuntosDaProva,
  listarDisciplinasDaProva,
  listarDisciplinasDoConcurso,
  listarSubassuntosDaProva,
  type NormalizedSelectionCatalog,
} from './selection'

const sourcePath = 'C:/Users/evaldo.cardoso/Documents/trt82026/conteudo-programatico.json'

async function realCatalog() {
  const parsed = parseTrt82026SourceText(await readFile(sourcePath, 'utf8'))
  assert.equal(parsed.success, true)
  if (!parsed.success) throw new Error('Fixture TRT8 inválida.')
  const plan = prepareNormalizedBootstrap(parsed.manifest, {
    declaredCommonBlocks: parsed.declaredCommonBlocks,
    examSchooling: parsed.examSchooling,
    legacyContestIdIgnored: true,
  }).plan
  const examIdByCode = new Map(plan.exams.map((exam, index) => [exam.code, index + 1]))
  const contentIdByKey = new Map(plan.catalog.map((content, index) => [content.canonicalKey, index + 1]))
  const catalog: NormalizedSelectionCatalog = {
    contests: [{ id: 15, slug: 'trt8-2026', name: plan.contest.nome, year: plan.contest.ano, board: plan.contest.banca }],
    exams: plan.exams.map((exam) => ({ id: examIdByCode.get(exam.code)!, contestId: 15, code: exam.code, name: exam.name, role: exam.role, specialty: exam.specialty })),
    taxonomy: buildNormalizedSelectionTaxonomy(
      plan.links.map((link) => ({
        prova_id: examIdByCode.get(link.examCode)!, conteudo_id: contentIdByKey.get(link.canonicalKey)!, concurso_id: 15,
        ativo: link.active, disciplina_ordem: link.disciplineOrder, assunto_ordem: link.subjectOrder,
        subassunto_ordem: link.subsubjectOrder, ordem: link.order,
      })),
      plan.catalog.map((content) => ({
        id: contentIdByKey.get(content.canonicalKey)!, concurso_id: 15, disciplina: content.disciplina,
        assunto: content.assunto, subassunto: content.subassunto, ativo: content.active,
      })),
    ),
  }
  return { catalog, plan, examIdByCode, contentIdByKey }
}

test('união de disciplinas do concurso remove duplicatas e preserva a ordem canônica', () => {
  const catalog: NormalizedSelectionCatalog = {
    contests: [], exams: [], taxonomy: [
      { contestId: 7, examId: 10, discipline: 'Língua Portuguesa', subject: null, subsubject: null, disciplineOrder: 1, subjectOrder: null, subsubjectOrder: null, order: 1 },
      { contestId: 7, examId: 10, discipline: 'Matemática e Raciocínio Lógico', subject: null, subsubject: null, disciplineOrder: 2, subjectOrder: null, subsubjectOrder: null, order: 2 },
      { contestId: 7, examId: 11, discipline: 'Língua Portuguesa', subject: 'Interpretação', subsubject: null, disciplineOrder: 1, subjectOrder: 1, subsubjectOrder: null, order: 1 },
      { contestId: 7, examId: 11, discipline: 'Noções de Direito Administrativo', subject: null, subsubject: null, disciplineOrder: 3, subjectOrder: null, subsubjectOrder: null, order: 3 },
      { contestId: 8, examId: 20, discipline: 'Disciplina de outro concurso', subject: null, subsubject: null, disciplineOrder: 1, subjectOrder: null, subsubjectOrder: null, order: 1 },
    ],
  }
  assert.deepEqual(listarDisciplinasDaProva(catalog, 10), ['Língua Portuguesa', 'Matemática e Raciocínio Lógico'])
  assert.deepEqual(listarDisciplinasDoConcurso(catalog, 7), ['Língua Portuguesa', 'Matemática e Raciocínio Lógico', 'Noções de Direito Administrativo'])
})

test('TRT8 normalizado preserva 24 provas e as contagens de vínculos auditadas', async () => {
  const { catalog, examIdByCode } = await realCatalog()
  assert.equal(catalog.exams.length, 24)
  const expected = { C01: 97, C02: 109, C04: 70, C21: 75, C23: 65, C24: 74 }
  for (const [suffix, count] of Object.entries(expected)) {
    const examId = examIdByCode.get(`TRT8-2026-${suffix}`)!
    assert.equal(catalog.taxonomy.filter((row) => row.examId === examId).length, count)
  }
})

test('C03 expõe as disciplinas canônicas reais na ordem do catálogo', async () => {
  const { catalog, examIdByCode } = await realCatalog()
  const disciplines = listarDisciplinasDaProva(catalog, examIdByCode.get('TRT8-2026-C03')!)
  assert.deepEqual(disciplines, [
    'Língua Portuguesa',
    'Matemática e Raciocínio Lógico',
    'Noções de Legislação',
    'Noções de Direitos Humanos',
    'Noções sobre Direitos das Pessoas com Deficiência',
    'Noções de Informática',
    'Noções de Direito Constitucional',
    'Noções de Direito Administrativo e de Administração Pública',
    'Noções de Orçamento Público',
    'Noções de Gestão de Pessoas',
    'Noções de Administração Geral',
    'Noções Gerais de Recursos Materiais',
  ])
})

test('Informática surge somente dos vínculos e não aparece nas provas C04/C23', async () => {
  const { catalog, examIdByCode } = await realCatalog()
  for (const code of ['TRT8-2026-C04', 'TRT8-2026-C23']) {
    assert.equal(listarDisciplinasDaProva(catalog, examIdByCode.get(code)!).includes('Noções de Informática'), false)
  }
  assert.equal(listarDisciplinasDaProva(catalog, examIdByCode.get('TRT8-2026-C01')!).includes('Noções de Informática'), true)
})

test('conteúdo exclusivo não contamina outra prova e compartilhado não duplica opções', async () => {
  const { catalog, plan, examIdByCode } = await realCatalog()
  const examsByKey = new Map<string, Set<string>>()
  for (const link of plan.links) {
    const exams = examsByKey.get(link.canonicalKey) ?? new Set<string>()
    exams.add(link.examCode); examsByKey.set(link.canonicalKey, exams)
  }
  const exclusive = [...examsByKey].find(([, exams]) => exams.size === 1)
  assert.ok(exclusive)
  const [key, exams] = exclusive
  const ownerCode = [...exams][0]
  const exclusiveContent = plan.catalog.find((content) => content.canonicalKey === key)!
  const ownerId = examIdByCode.get(ownerCode)!
  const other = catalog.exams.find((exam) => exam.code !== ownerCode)!
  const matchesExclusive = (row: NormalizedSelectionCatalog['taxonomy'][number]) => row.discipline === exclusiveContent.disciplina
    && row.subject === exclusiveContent.assunto && row.subsubject === exclusiveContent.subassunto
  assert.equal(catalog.taxonomy.some((row) => row.examId === ownerId && matchesExclusive(row)), true)
  assert.equal(catalog.taxonomy.some((row) => row.examId === other.id && matchesExclusive(row)), false)

  const c01 = examIdByCode.get('TRT8-2026-C01')!
  const disciplines = listarDisciplinasDaProva(catalog, c01)
  assert.equal(disciplines.length, new Set(disciplines).size)
  const subjects = listarAssuntosDaProva(catalog, c01, 'Língua Portuguesa')
  assert.equal(subjects.length, new Set(subjects).size)
  assert.ok(subjects.includes('Redação Oficial'))
  assert.deepEqual(listarSubassuntosDaProva(catalog, c01, 'Língua Portuguesa', 'Redação Oficial'), [])
})

test('textos UTF-8 permanecem íntegros na camada de seleção', async () => {
  const { catalog } = await realCatalog()
  const labels = catalog.exams.flatMap((exam) => [exam.role, exam.specialty])
  for (const expected of ['Analista Judiciário', 'Tecnologia da Informação', 'Médico do Trabalho', 'Área Administrativa', 'Agente da Polícia Judicial']) {
    assert.ok(labels.includes(expected))
  }
})
