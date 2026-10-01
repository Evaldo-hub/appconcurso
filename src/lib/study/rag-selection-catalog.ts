import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

export interface RagSelectionContest { id: number; name: string; year: number | null; board: string }
export interface RagSelectionExam { id: number; contestId: number; name: string }
export interface RagSelectionTaxonomy {
  contestId: number
  examId: number | null
  discipline: string
  subject: string
  subsubject: string | null
}
export interface RagSelectionCatalog {
  contests: RagSelectionContest[]
  exams: RagSelectionExam[]
  taxonomy: RagSelectionTaxonomy[]
}
export interface RagSelectionCatalogResult { catalog: RagSelectionCatalog; error: string | null }

const emptyCatalog: RagSelectionCatalog = { contests: [], exams: [], taxonomy: [] }
const normalizedText = (value: unknown) => typeof value === 'string' ? value.trim() : ''

export async function loadRagSelectionCatalog(): Promise<RagSelectionCatalogResult> {
  const supabase = createAdminClient()
  const [materialsResult, ingestionsResult] = await Promise.all([
    supabase.from('materiais_concurso').select('id, concurso_id, prova_id, disciplina, assunto, subassunto').eq('ativo', true),
    supabase.from('rag_ingestoes').select('material_id').eq('ativa', true).eq('status', 'concluida').eq('ingestion_version', 'rag-v2'),
  ])
  if (materialsResult.error || ingestionsResult.error) {
    return { catalog: emptyCatalog, error: 'Não foi possível carregar os conteúdos disponíveis para estudo.' }
  }

  const readyMaterialIds = new Set((ingestionsResult.data ?? []).map((item) => Number(item.material_id)))
  const taxonomy = (materialsResult.data ?? []).flatMap((material): RagSelectionTaxonomy[] => {
    const discipline = normalizedText(material.disciplina)
    const subject = normalizedText(material.assunto)
    if (!readyMaterialIds.has(Number(material.id)) || !discipline || !subject) return []
    const subsubject = normalizedText(material.subassunto)
    return [{
      contestId: Number(material.concurso_id),
      examId: material.prova_id === null ? null : Number(material.prova_id),
      discipline,
      subject,
      subsubject: subsubject || null,
    }]
  })

  const contestIds = [...new Set(taxonomy.map((item) => item.contestId))]
  if (contestIds.length === 0) return { catalog: emptyCatalog, error: null }
  const [contestsResult, examsResult] = await Promise.all([
    supabase.from('concursos').select('id, nome, ano, banca').in('id', contestIds).order('nome'),
    supabase.from('provas').select('id, concurso_id, nome').in('concurso_id', contestIds).order('nome'),
  ])
  if (contestsResult.error || examsResult.error) {
    return { catalog: emptyCatalog, error: 'Não foi possível carregar concursos e provas disponíveis.' }
  }

  const globalMaterialContests = new Set(taxonomy.filter((item) => item.examId === null).map((item) => item.contestId))
  const specificExamIds = new Set(taxonomy.flatMap((item) => item.examId === null ? [] : [item.examId]))
  const exams = (examsResult.data ?? [])
    .filter((exam) => globalMaterialContests.has(Number(exam.concurso_id)) || specificExamIds.has(Number(exam.id)))
    .map((exam) => ({ id: Number(exam.id), contestId: Number(exam.concurso_id), name: normalizedText(exam.nome) }))
    .filter((exam) => exam.name)
  const contestsWithExams = new Set(exams.map((exam) => exam.contestId))
  const contests = (contestsResult.data ?? [])
    .filter((contest) => contestsWithExams.has(Number(contest.id)))
    .map((contest) => ({ id: Number(contest.id), name: normalizedText(contest.nome), year: typeof contest.ano === 'number' ? contest.ano : null, board: normalizedText(contest.banca) }))
    .filter((contest) => contest.name && contest.board)

  return { catalog: { contests, exams, taxonomy }, error: null }
}
