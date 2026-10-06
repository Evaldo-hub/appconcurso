import assert from 'node:assert/strict'
import test from 'node:test'
import type { NormalizedSelectionCatalog } from '@/lib/contest-catalog/selection'
import { disciplineAfterProofChange, listRagMaterialDisciplines } from './admin-material-discipline'

const catalog: NormalizedSelectionCatalog = {
  contests: [], exams: [], taxonomy: [
    { contestId: 15, examId: 65, discipline: 'Língua Portuguesa', subject: null, subsubject: null, disciplineOrder: 1, subjectOrder: null, subsubjectOrder: null, order: 1 },
    { contestId: 15, examId: 65, discipline: 'Matemática e Raciocínio Lógico', subject: null, subsubject: null, disciplineOrder: 2, subjectOrder: null, subsubjectOrder: null, order: 2 },
    { contestId: 15, examId: 65, discipline: 'Noções de Direito Administrativo e de Administração Pública', subject: null, subsubject: null, disciplineOrder: 8, subjectOrder: null, subsubjectOrder: null, order: 8 },
    { contestId: 15, examId: 66, discipline: 'Língua Portuguesa', subject: null, subsubject: null, disciplineOrder: 1, subjectOrder: null, subsubjectOrder: null, order: 1 },
    { contestId: 15, examId: 66, discipline: 'Noções de Informática', subject: null, subsubject: null, disciplineOrder: 4, subjectOrder: null, subsubjectOrder: null, order: 4 },
    { contestId: 16, examId: 80, discipline: 'Disciplina externa', subject: null, subsubject: null, disciplineOrder: 1, subjectOrder: null, subsubjectOrder: null, order: 1 },
  ],
}

test('C03 recebe somente disciplinas canônicas vinculadas à prova', () => {
  assert.deepEqual(listRagMaterialDisciplines(catalog, 15, 65), [
    'Língua Portuguesa',
    'Matemática e Raciocínio Lógico',
    'Noções de Direito Administrativo e de Administração Pública',
  ])
})

test('material geral recebe união ordenada e distinta do concurso', () => {
  assert.deepEqual(listRagMaterialDisciplines(catalog, 15, null), [
    'Língua Portuguesa',
    'Matemática e Raciocínio Lógico',
    'Noções de Informática',
    'Noções de Direito Administrativo e de Administração Pública',
  ])
  assert.equal(listRagMaterialDisciplines(catalog, 15, null).includes('Disciplina externa'), false)
})

test('mudança de prova limpa disciplina incompatível e preserva a ainda válida', () => {
  const c04 = listRagMaterialDisciplines(catalog, 15, 66)
  assert.equal(disciplineAfterProofChange('Matemática e Raciocínio Lógico', c04), '')
  assert.equal(disciplineAfterProofChange('Língua Portuguesa', c04), 'Língua Portuguesa')
})
