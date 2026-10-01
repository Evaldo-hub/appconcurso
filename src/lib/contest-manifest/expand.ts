import type { ContestManifest, ExpandedContentRow, ExpandedExam, ExpandedManifest, ManifestDiscipline } from './types'

function flattenDiscipline(examCode: string, discipline: ManifestDiscipline): ExpandedContentRow[] {
  const base: ExpandedContentRow = { prova_codigo: examCode, disciplina: discipline.disciplina, assunto: null, subassunto: null, ordem: discipline.ordem, ativo: discipline.ativo, disciplina_ordem: discipline.ordem, assunto_ordem: null, subassunto_ordem: null }
  const contents = discipline.assuntos.flatMap<ExpandedContentRow>((subject) => {
    const subjectRow: ExpandedContentRow = { prova_codigo: examCode, disciplina: discipline.disciplina, assunto: subject.assunto, subassunto: null, ordem: subject.ordem, ativo: discipline.ativo && subject.ativo, disciplina_ordem: discipline.ordem, assunto_ordem: subject.ordem, subassunto_ordem: null }
    const subtopicRows = subject.subassuntos.map<ExpandedContentRow>((subtopic) => ({ prova_codigo: examCode, disciplina: discipline.disciplina, assunto: subject.assunto, subassunto: subtopic.subassunto, ordem: subtopic.ordem, ativo: discipline.ativo && subject.ativo && subtopic.ativo, disciplina_ordem: discipline.ordem, assunto_ordem: subject.ordem, subassunto_ordem: subtopic.ordem }))
    return [subjectRow, ...subtopicRows]
  })
  return [base, ...contents]
}

export function expandContestManifest(manifest: ContestManifest): ExpandedManifest {
  const commonByCode = new Map(manifest.conteudos_comuns.map((item) => [item.codigo, item]))
  const exams: ExpandedExam[] = manifest.provas.map((exam) => {
    const disciplines = [...exam.conteudos_comuns.flatMap((code) => commonByCode.get(code)?.disciplinas ?? []), ...exam.conteudo_programatico]
    const catalog = disciplines.flatMap((discipline) => flattenDiscipline(exam.codigo, discipline))
    return { ...exam, catalogo: catalog, totais: { disciplinas: disciplines.length, assuntos: disciplines.reduce((total, item) => total + item.assuntos.length, 0), subassuntos: disciplines.reduce((total, item) => total + item.assuntos.reduce((sum, subject) => sum + subject.subassuntos.length, 0), 0) } }
  })
  return { manifesto: manifest, provas: exams, conteudos: exams.flatMap((exam) => exam.catalogo), totais: { provas: exams.length, disciplinas: exams.reduce((total, exam) => total + exam.totais.disciplinas, 0), assuntos: exams.reduce((total, exam) => total + exam.totais.assuntos, 0), subassuntos: exams.reduce((total, exam) => total + exam.totais.subassuntos, 0), materiais: manifest.materiais.length } }
}
