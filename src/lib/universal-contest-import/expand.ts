import type { ProgramFile, UniversalContentRow } from './types'

export function expandProgramFile(program: ProgramFile) {
  const contents: UniversalContentRow[] = []
  const details = program.provas.map((exam) => {
    let subjects = 0
    for (const discipline of exam.disciplinas) {
      contents.push({ prova_codigo: exam.codigo_prova, disciplina: discipline.nome, assunto: null, subassunto: null, disciplina_ordem: discipline.ordem, assunto_ordem: null, subassunto_ordem: null })
      for (const subject of discipline.assuntos) {
        subjects += 1
        contents.push({ prova_codigo: exam.codigo_prova, disciplina: discipline.nome, assunto: subject.nome, subassunto: null, disciplina_ordem: discipline.ordem, assunto_ordem: subject.ordem, subassunto_ordem: null })
        for (const subtopic of subject.subassuntos) contents.push({ prova_codigo: exam.codigo_prova, disciplina: discipline.nome, assunto: subject.nome, subassunto: subtopic.nome, disciplina_ordem: discipline.ordem, assunto_ordem: subject.ordem, subassunto_ordem: subtopic.ordem })
      }
    }
    return { codigo: exam.codigo_prova, cargo: exam.cargo, especialidade: exam.especialidade, escolaridade: exam.escolaridade, disciplinas: exam.disciplinas.length, assuntos: subjects }
  })
  return {
    contents,
    details,
    totals: {
      provas: program.provas.length,
      disciplinas: program.provas.reduce((sum, exam) => sum + exam.disciplinas.length, 0),
      assuntos: details.reduce((sum, exam) => sum + exam.assuntos, 0),
      subassuntos: contents.filter((row) => row.subassunto !== null).length,
    },
  }
}
