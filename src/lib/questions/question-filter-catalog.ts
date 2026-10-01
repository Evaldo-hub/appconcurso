import type { FilterOption, QuestionFilterOptions, QuestionFilters } from '@/services/questoes.service'

export interface QuestionCatalogEntry {
  concursoId: string
  provaId: string
  disciplina: string
  assunto: string | null
  subassunto: string | null
  ordem: number | null
  disciplinaOrdem: number | null
  assuntoOrdem: number | null
  subassuntoOrdem: number | null
}

export interface QuestionBankFilterData {
  concursos: Array<FilterOption & { banca: string }>
  provas: FilterOption[]
  catalogo: QuestionCatalogEntry[]
  dificuldades: FilterOption[]
}

export type CanonicalDifficulty = 'Fácil' | 'Média' | 'Difícil'

export const canonicalDifficultyOptions: FilterOption[] = [
  { value: 'Fácil', label: 'Fácil' },
  { value: 'Média', label: 'Média' },
  { value: 'Difícil', label: 'Difícil' },
]

const historicalDifficultyValues: Record<CanonicalDifficulty, string[]> = {
  Fácil: ['Fácil', 'facil'],
  Média: ['Média', 'media', 'Médio', 'medio'],
  Difícil: ['Difícil'],
}

const normalizedText = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLocaleLowerCase('pt-BR')

export function formatContestLabel(name: string, year: number | null) {
  const trimmedName = name.trim()
  if (!year || new RegExp(`(^|\\D)${year}(\\D|$)`).test(trimmedName)) return trimmedName
  return `${trimmedName} — ${year}`
}

export function formatExamLabel(name: string, cargo: string | null, specialty: string | null) {
  let label = name.trim()
  for (const detail of [cargo, specialty]) {
    const trimmedDetail = detail?.trim()
    if (trimmedDetail && !normalizedText(label).includes(normalizedText(trimmedDetail))) label += ` — ${trimmedDetail}`
  }
  return label
}

export function normalizeDifficulty(value: string | null | undefined): CanonicalDifficulty | null {
  const normalized = normalizedText(value ?? '')
  if (normalized === 'facil') return 'Fácil'
  if (normalized === 'media' || normalized === 'medio') return 'Média'
  if (normalized === 'dificil') return 'Difícil'
  return null
}

export function difficultyQueryValues(value: string): string[] {
  const normalized = normalizeDifficulty(value)
  return normalized ? historicalDifficultyValues[normalized] : []
}

const orderedOptions = (
  entries: QuestionCatalogEntry[],
  value: (entry: QuestionCatalogEntry) => string | null,
  order: (entry: QuestionCatalogEntry) => number | null,
) => {
  const values = new Map<string, number>()

  for (const entry of entries) {
    const name = value(entry)?.trim()
    if (!name) continue
    const position = order(entry) ?? Number.MAX_SAFE_INTEGER
    values.set(name, Math.min(values.get(name) ?? Number.MAX_SAFE_INTEGER, position))
  }

  return Array.from(values, ([name, position]) => ({ name, position }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'pt-BR'))
    .map(({ name }) => ({ value: name, label: name }))
}

export function deriveQuestionBankOptions(data: QuestionBankFilterData, filters: QuestionFilters): QuestionFilterOptions {
  const selectedCatalog = filters.concursoId && filters.provaId
    ? data.catalogo.filter((entry) => entry.concursoId === filters.concursoId && entry.provaId === filters.provaId)
    : []
  const selectedDiscipline = filters.disciplina
    ? selectedCatalog.filter((entry) => entry.disciplina === filters.disciplina)
    : []
  const selectedSubject = filters.assunto
    ? selectedDiscipline.filter((entry) => entry.assunto === filters.assunto)
    : []
  const contest = data.concursos.find((option) => option.value === filters.concursoId)

  return {
    concursos: data.concursos.map(({ value, label }) => ({ value, label })),
    provas: data.provas.filter((option) => !filters.concursoId || option.parentId === filters.concursoId),
    bancas: contest?.banca ? [{ value: contest.banca, label: contest.banca }] : [],
    disciplinas: orderedOptions(selectedCatalog, (entry) => entry.disciplina, (entry) => entry.disciplinaOrdem ?? entry.ordem),
    assuntos: orderedOptions(selectedDiscipline, (entry) => entry.assunto, (entry) => entry.assuntoOrdem ?? entry.ordem),
    subassuntos: orderedOptions(selectedSubject, (entry) => entry.subassunto, (entry) => entry.subassuntoOrdem ?? entry.ordem),
    dificuldades: data.dificuldades,
  }
}

export function updateQuestionFilter(
  filters: QuestionFilters,
  field: keyof QuestionFilters,
  value: string,
  contestBoard = '',
): QuestionFilters {
  if (field === 'concursoId') return { ...filters, concursoId: value, provaId: '', banca: contestBoard, disciplina: '', assunto: '', subassunto: '' }
  if (field === 'provaId') return { ...filters, provaId: value, disciplina: '', assunto: '', subassunto: '' }
  if (field === 'disciplina') return { ...filters, disciplina: value, assunto: '', subassunto: '' }
  if (field === 'assunto') return { ...filters, assunto: value, subassunto: '' }
  return { ...filters, [field]: value }
}
