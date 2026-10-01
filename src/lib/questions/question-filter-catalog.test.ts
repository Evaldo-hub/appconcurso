import assert from 'node:assert/strict'
import test from 'node:test'
// Node's native TypeScript test runner requires the explicit extension.
// @ts-expect-error The project compiles with noEmit, so this import is never emitted.
import { deriveQuestionBankOptions, difficultyQueryValues, formatContestLabel, formatExamLabel, normalizeDifficulty, updateQuestionFilter, type QuestionBankFilterData } from './question-filter-catalog.ts'

const emptyQuestionFilters = {
  concursoId: '', provaId: '', banca: '', disciplina: '', assunto: '', subassunto: '', dificuldade: '', ids: '', status: '' as const,
}

const catalogEntry = (disciplina: string, disciplinaOrdem: number, assunto: string | null = null, assuntoOrdem: number | null = null, subassunto: string | null = null, subassuntoOrdem: number | null = null) => ({
  concursoId: '7', provaId: '10', disciplina, assunto, subassunto, ordem: disciplinaOrdem, disciplinaOrdem, assuntoOrdem, subassuntoOrdem,
})

const disciplines = [
  'Língua Portuguesa', 'Raciocínio Lógico', 'Noções de Informática Aplicada', 'Legislação Complementar',
  'Noções de Direito Constitucional', 'Noções de Direito Administrativo', 'Noções de Direito do Trabalho',
  'Noções de Administração Pública e Geral', 'Noções de AFO e Orçamento Público',
  'Noções de Administração de Recursos Humanos', 'Noções de Administração de Recursos Materiais',
  'Noções de Contabilidade Pública',
]

const data: QuestionBankFilterData = {
  concursos: [{ value: '7', label: 'TRT8 — 2022', banca: 'Cebraspe' }],
  provas: [{ value: '10', label: 'TRT8 2022 - Cargo 1', parentId: '7' }],
  catalogo: [
    ...disciplines.flatMap((disciplina, index) => [
      catalogEntry(disciplina, index + 1),
      catalogEntry(disciplina, index + 1, `${disciplina} - assunto`, 1),
    ]),
    { ...catalogEntry('TESTE RPC', 1), concursoId: '1', provaId: '1' },
    catalogEntry('Língua Portuguesa', 1, 'Ortografia', 2, 'Acentuação', 1),
  ],
  dificuldades: [{ value: 'Média', label: 'Média' }],
}

test('TRT8 prova 10 exibe as 12 disciplinas oficiais na ordem e sem contaminação', () => {
  const options = deriveQuestionBankOptions(data, { ...emptyQuestionFilters, concursoId: '7', provaId: '10' })
  assert.deepEqual(options.disciplinas.map((option) => option.value), disciplines)
  assert.equal(options.disciplinas.length, 12)
  assert.equal(options.disciplinas.some((option) => option.value === 'TESTE RPC'), false)
  assert.deepEqual(options.bancas, [{ value: 'Cebraspe', label: 'Cebraspe' }])
})

test('assuntos dependem da disciplina, ignoram linhas-base e subassuntos dependem do assunto', () => {
  const filters = { ...emptyQuestionFilters, concursoId: '7', provaId: '10', disciplina: 'Língua Portuguesa' }
  const subjects = deriveQuestionBankOptions(data, filters)
  assert.deepEqual(subjects.assuntos.map((option) => option.value), ['Língua Portuguesa - assunto', 'Ortografia'])
  assert.deepEqual(subjects.subassuntos, [])

  const subtopics = deriveQuestionBankOptions(data, { ...filters, assunto: 'Ortografia' })
  assert.deepEqual(subtopics.subassuntos.map((option) => option.value), ['Acentuação'])
})

test('reseta todos os descendentes ao alterar um filtro pai', () => {
  const selected = { ...emptyQuestionFilters, concursoId: '1', provaId: '1', banca: 'FGV', disciplina: 'Banco de Dados', assunto: 'SQL', subassunto: 'JOIN' }
  assert.deepEqual(updateQuestionFilter(selected, 'concursoId', '7', 'Cebraspe'), { ...selected, concursoId: '7', provaId: '', banca: 'Cebraspe', disciplina: '', assunto: '', subassunto: '' })
  assert.deepEqual(updateQuestionFilter(selected, 'provaId', '10'), { ...selected, provaId: '10', disciplina: '', assunto: '', subassunto: '' })
  assert.deepEqual(updateQuestionFilter(selected, 'disciplina', 'Português'), { ...selected, disciplina: 'Português', assunto: '', subassunto: '' })
  assert.deepEqual(updateQuestionFilter(selected, 'assunto', 'Ortografia'), { ...selected, assunto: 'Ortografia', subassunto: '' })
})

test('evita repetir ano, cargo e especialidade nos labels', () => {
  assert.equal(formatContestLabel('Concurso Nacional EBSERH 2025', 2025), 'Concurso Nacional EBSERH 2025')
  assert.equal(formatContestLabel('Concurso TRT8 C-336', 2022), 'Concurso TRT8 C-336 — 2022')
  assert.equal(formatExamLabel('EBSERH 2025 - Analista de Tecnologia da Informação', 'Analista de Tecnologia da Informação', 'Tecnologia da Informação'), 'EBSERH 2025 - Analista de Tecnologia da Informação')
  assert.equal(formatExamLabel('EBSERH 2025', 'Analista de Tecnologia da Informação', 'Tecnologia da Informação'), 'EBSERH 2025 — Analista de Tecnologia da Informação')
})

test('normaliza dificuldades e consulta somente variantes históricas confirmadas', () => {
  assert.equal(normalizeDifficulty(' fácil '), 'Fácil')
  assert.equal(normalizeDifficulty('MEDIA'), 'Média')
  assert.equal(normalizeDifficulty('Médio'), 'Média')
  assert.equal(normalizeDifficulty('dificil'), 'Difícil')
  assert.equal(normalizeDifficulty('desconhecida'), null)
  assert.deepEqual(difficultyQueryValues('Fácil'), ['Fácil', 'facil'])
  assert.deepEqual(difficultyQueryValues('Média'), ['Média', 'media', 'Médio', 'medio'])
  assert.deepEqual(difficultyQueryValues('Difícil'), ['Difícil'])
})
