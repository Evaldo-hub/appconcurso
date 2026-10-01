export interface StudyPerformanceSummary { totalRespondidas: number; totalCorretas: number; totalIncorretas: number; taxaAcerto: number; tempoMedio: number | null }
export interface StudyDisciplinePerformance { disciplina: string; respondidas: number; corretas: number; incorretas: number; taxaAcerto: number }
export interface StudySubjectPerformance extends StudyDisciplinePerformance { assunto: string }
export interface StudyAnswerHistoryItem { id: number; questaoId: number; disciplina: string; assunto: string; alternativaSelecionada: string; correta: boolean; tempoGasto: number | null; createdAt: string }
export interface StudyPerformanceData { summary: StudyPerformanceSummary; disciplines: StudyDisciplinePerformance[]; subjects: StudySubjectPerformance[]; history: StudyAnswerHistoryItem[] }

export interface StudyPerformanceRow { id: number; usuarioId: string; questaoId: number; alternativaSelecionada: string; correta: boolean; tempoGasto: number | null; createdAt: string; disciplina: string; assunto: string }

const rate = (correct: number, total: number) => total === 0 ? 0 : Math.round((correct / total) * 1000) / 10
const compare = <T extends { respondidas: number }>(name: (item: T) => string) => (left: T, right: T) => right.respondidas - left.respondidas || name(left).localeCompare(name(right), 'pt-BR')

export function calculateStudyPerformance(rows: StudyPerformanceRow[], historyLimit = 20): StudyPerformanceData {
  const correct = rows.filter((row) => row.correta).length
  const times = rows.flatMap((row) => row.tempoGasto === null ? [] : [row.tempoGasto])
  const summary: StudyPerformanceSummary = {
    totalRespondidas: rows.length,
    totalCorretas: correct,
    totalIncorretas: rows.length - correct,
    taxaAcerto: rate(correct, rows.length),
    tempoMedio: times.length ? Math.round((times.reduce((sum, value) => sum + value, 0) / times.length) * 10) / 10 : null,
  }
  const disciplineGroups = new Map<string, { respondidas: number; corretas: number }>()
  const subjectGroups = new Map<string, { disciplina: string; assunto: string; respondidas: number; corretas: number }>()
  for (const row of rows) {
    const discipline = row.disciplina.trim() || 'Sem disciplina'
    const subject = row.assunto.trim() || 'Sem assunto'
    const d = disciplineGroups.get(discipline) ?? { respondidas: 0, corretas: 0 }
    d.respondidas += 1; if (row.correta) d.corretas += 1; disciplineGroups.set(discipline, d)
    const key = `${discipline}\u0000${subject}`
    const s = subjectGroups.get(key) ?? { disciplina: discipline, assunto: subject, respondidas: 0, corretas: 0 }
    s.respondidas += 1; if (row.correta) s.corretas += 1; subjectGroups.set(key, s)
  }
  const disciplines = Array.from(disciplineGroups, ([disciplina, item]) => ({ disciplina, respondidas: item.respondidas, corretas: item.corretas, incorretas: item.respondidas - item.corretas, taxaAcerto: rate(item.corretas, item.respondidas) })).sort(compare((item) => item.disciplina))
  const subjects = Array.from(subjectGroups.values(), (item) => ({ ...item, incorretas: item.respondidas - item.corretas, taxaAcerto: rate(item.corretas, item.respondidas) })).sort(compare((item) => `${item.disciplina}\u0000${item.assunto}`))
  const history = [...rows].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id).slice(0, historyLimit).map((row) => ({ id: row.id, questaoId: row.questaoId, disciplina: row.disciplina, assunto: row.assunto, alternativaSelecionada: row.alternativaSelecionada, correta: row.correta, tempoGasto: row.tempoGasto, createdAt: row.createdAt }))
  return { summary, disciplines, subjects, history }
}

export function formatStudyTime(seconds: number | null) {
  if (seconds === null) return '—'
  const rounded = Math.round(seconds)
  return rounded < 60 ? `${rounded} s` : `${Math.floor(rounded / 60)} min${rounded % 60 ? ` ${rounded % 60} s` : ''}`
}

export function createStudyPerformanceLoader(dependencies: { authenticate(): Promise<string | null>; loadRows(userId: string): Promise<StudyPerformanceRow[]> }) {
  return async (historyLimit = 20) => {
    const userId = await dependencies.authenticate()
    if (!userId) return { authenticated: false as const, data: null }
    const rows = await dependencies.loadRows(userId)
    return { authenticated: true as const, data: calculateStudyPerformance(rows, historyLimit) }
  }
}
