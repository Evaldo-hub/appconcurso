export interface NormalizedSelectionContest {
  id: number
  slug: string
  name: string
  year: number | null
  board: string
}

export interface NormalizedSelectionExam {
  id: number
  contestId: number
  code: string
  name: string
  role: string | null
  specialty: string | null
}

export interface NormalizedSelectionTaxonomy {
  contestId: number
  examId: number
  discipline: string
  subject: string | null
  subsubject: string | null
  disciplineOrder: number | null
  subjectOrder: number | null
  subsubjectOrder: number | null
  order: number | null
}

export interface NormalizedSelectionCatalog {
  contests: NormalizedSelectionContest[]
  exams: NormalizedSelectionExam[]
  taxonomy: NormalizedSelectionTaxonomy[]
}

export interface NormalizedCatalogLinkRow {
  prova_id: number
  conteudo_id: number
  concurso_id: number
  ativo: boolean
  disciplina_ordem: number | null
  assunto_ordem: number | null
  subassunto_ordem: number | null
  ordem: number | null
}

export interface NormalizedCatalogContentRow {
  id: number
  concurso_id: number
  disciplina: string
  assunto: string | null
  subassunto: string | null
  ativo: boolean
}

export function buildNormalizedSelectionTaxonomy(
  links: NormalizedCatalogLinkRow[],
  contents: NormalizedCatalogContentRow[],
): NormalizedSelectionTaxonomy[] {
  const contentById = new Map(contents.filter((row) => row.ativo).map((row) => [row.id, row]))
  const seen = new Set<string>()
  return links.flatMap((link) => {
    const content = contentById.get(link.conteudo_id)
    if (!link.ativo || !content || content.concurso_id !== link.concurso_id) return []
    const identity = `${link.prova_id}\0${content.id}`
    if (seen.has(identity)) return []
    seen.add(identity)
    return [{
      contestId: link.concurso_id,
      examId: link.prova_id,
      discipline: content.disciplina,
      subject: content.assunto,
      subsubject: content.subassunto,
      disciplineOrder: link.disciplina_ordem,
      subjectOrder: link.assunto_ordem,
      subsubjectOrder: link.subassunto_ordem,
      order: link.ordem,
    }]
  })
}

function orderedDistinct(
  rows: NormalizedSelectionTaxonomy[],
  value: (row: NormalizedSelectionTaxonomy) => string | null,
  order: (row: NormalizedSelectionTaxonomy) => number | null,
) {
  const values = new Map<string, number>()
  for (const row of rows) {
    const text = value(row)?.trim()
    if (!text) continue
    values.set(text, Math.min(values.get(text) ?? Number.MAX_SAFE_INTEGER, order(row) ?? Number.MAX_SAFE_INTEGER))
  }
  return [...values].sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0], 'pt-BR')).map(([text]) => text)
}

export function listarDisciplinasDaProva(catalog: NormalizedSelectionCatalog, examId: number) {
  return orderedDistinct(catalog.taxonomy.filter((row) => row.examId === examId), (row) => row.discipline, (row) => row.disciplineOrder ?? row.order)
}

export function listarAssuntosDaProva(catalog: NormalizedSelectionCatalog, examId: number, discipline: string) {
  return orderedDistinct(catalog.taxonomy.filter((row) => row.examId === examId && row.discipline === discipline), (row) => row.subject, (row) => row.subjectOrder ?? row.order)
}

export function listarSubassuntosDaProva(catalog: NormalizedSelectionCatalog, examId: number, discipline: string, subject: string) {
  return orderedDistinct(catalog.taxonomy.filter((row) => row.examId === examId && row.discipline === discipline && row.subject === subject), (row) => row.subsubject, (row) => row.subsubjectOrder ?? row.order)
}
