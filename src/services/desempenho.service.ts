import { createClient } from '@/lib/supabase/client'

export interface DashboardMetrics { questoesRespondidas: number; acertos: number; erros: number; percentualAcerto: number; tempoEstudado: number; simuladosRealizados: number; questoesPendentesRevisao: number | null }
export interface DashboardActivity { id: string; tipo: 'simulado' | 'questao'; titulo: string; data: string; resultado: 'concluido' | 'em_andamento' | 'acerto' | 'erro' }
export interface DashboardPerformance { label: string; questoes: number; acertos: number; percentual: number }
export interface DashboardEvolution { label: string; value: number }
export interface DifficultSubject { assunto: string; disciplina: string; erroRate: number; questoes: number }
export interface ContinueStudying { id: string; titulo: string; respondidas: number; total: number }
export interface DashboardData { metrics: DashboardMetrics; recentActivities: DashboardActivity[]; performanceByDiscipline: DashboardPerformance[]; performanceBySubject: DashboardPerformance[]; difficultSubjects: DifficultSubject[]; evolution: DashboardEvolution[]; continueStudying: ContinueStudying | null; limitedMetrics: string[] }
export interface PerformanceMetrics { respondidas: number; acertos: number; erros: number; percentual: number }
export interface PerformanceGroup { label: string; total: number; acertos: number; percentual: number }
export interface DailyPerformance { data: string; total: number; acertos: number; percentual: number }
export interface ErrorDistribution { label: string; total: number }
export interface SimulationEvolution { id: number; data: string; respondidas: number; acertos: number; percentual: number }
export interface PerformancePanel { metricas: PerformanceMetrics; evolucao_diaria: DailyPerformance[]; por_disciplina: PerformanceGroup[]; por_assunto: PerformanceGroup[]; erros_por_dificuldade: ErrorDistribution[]; evolucao_simulados: SimulationEvolution[]; melhores_assuntos: PerformanceGroup[]; assuntos_atencao: PerformanceGroup[] }

interface SimuladoRow { id: string; disciplina: string | null; assunto: string | null; quantidade_questoes: number | null; data_criacao: string; data_conclusao: string | null; questoes_respondidas: number | null; acertos: number | null; erros: number | null; tempo_total: number | null }
interface QuestionRelation { disciplina: string | null; assunto: string | null }
interface AnswerRow { id: string; correta: boolean; tempo_gasto: number | null; created_at: string; questoes_estudo: QuestionRelation | QuestionRelation[] | null }
interface PerformanceEntry { disciplina: string | null; assunto: string | null; questoes: number; acertos: number }

const firstRelation = <T,>(relation: T | T[] | null): T | null => Array.isArray(relation) ? relation[0] ?? null : relation
function aggregateBy(rows: PerformanceEntry[], field: 'disciplina' | 'assunto'): DashboardPerformance[] {
  const groups = new Map<string, { questoes: number; acertos: number }>()
  rows.forEach((row) => { const label = row[field]?.trim(); if (!label) return; const current = groups.get(label) ?? { questoes: 0, acertos: 0 }; current.questoes += row.questoes; current.acertos += row.acertos; groups.set(label, current) })
  return Array.from(groups, ([label, values]) => ({ label, ...values, percentual: values.questoes ? Math.round((values.acertos / values.questoes) * 1000) / 10 : 0 })).sort((a, b) => b.questoes - a.questoes)
}

class DesempenhoService {
  private supabase = createClient()

  async getDashboard(userId: string): Promise<DashboardData> {
    const [simulationResult, answerResult] = await Promise.all([
      this.supabase.from('simulados').select('id, disciplina, assunto, quantidade_questoes, data_criacao, data_conclusao, questoes_respondidas, acertos, erros, tempo_total').eq('usuario_id', userId).order('data_criacao', { ascending: false }),
      this.supabase.from('respostas_questoes').select('id, correta, tempo_gasto, created_at, questoes_estudo(disciplina, assunto)').eq('usuario_id', userId).order('created_at', { ascending: false }),
    ])
    if (simulationResult.error) throw new Error('Não foi possível carregar os dados do Dashboard.')
    const answersUnavailable = Boolean(answerResult.error && ['PGRST205', '42P01'].includes(answerResult.error.code))
    if (answerResult.error && !answersUnavailable) throw new Error('Não foi possível carregar as respostas do Dashboard.')

    const simulados = (simulationResult.data ?? []) as SimuladoRow[]
    const answers = (answerResult.data ?? []) as unknown as AnswerRow[]
    const concluidos = simulados.filter((item) => Boolean(item.data_conclusao))
    const simulationQuestions = simulados.reduce((total, item) => total + (item.questoes_respondidas ?? 0), 0)
    const simulationHits = simulados.reduce((total, item) => total + (item.acertos ?? 0), 0)
    const questoesRespondidas = simulationQuestions + answers.length
    const acertos = simulationHits + answers.filter((item) => item.correta).length
    const erros = simulados.reduce((total, item) => total + (item.erros ?? 0), 0) + answers.filter((item) => !item.correta).length
    const performanceRows: PerformanceEntry[] = [
      ...simulados.map((item) => ({ disciplina: item.disciplina, assunto: item.assunto, questoes: item.questoes_respondidas ?? 0, acertos: item.acertos ?? 0 })),
      ...answers.map((item) => { const question = firstRelation(item.questoes_estudo); return { disciplina: question?.disciplina ?? null, assunto: question?.assunto ?? null, questoes: 1, acertos: item.correta ? 1 : 0 } }),
    ]
    const performanceByDiscipline = aggregateBy(performanceRows, 'disciplina')
    const performanceBySubject = aggregateBy(performanceRows, 'assunto')
    const difficultSubjects = performanceBySubject.filter((item) => item.questoes > 0).map((item) => ({ assunto: item.label, disciplina: performanceRows.find((row) => row.assunto === item.label)?.disciplina ?? 'Sem disciplina', erroRate: Math.round((100 - item.percentual) * 10) / 10, questoes: item.questoes })).sort((a, b) => b.erroRate - a.erroRate).slice(0, 5)
    const emAndamento = simulados.find((item) => !item.data_conclusao)
    const simulationActivities: DashboardActivity[] = simulados.map((item) => ({ id: item.id, tipo: 'simulado', titulo: item.assunto || item.disciplina || 'Simulado geral', data: item.data_conclusao || item.data_criacao, resultado: item.data_conclusao ? 'concluido' : 'em_andamento' }))
    const answerActivities: DashboardActivity[] = answers.map((item) => { const question = firstRelation(item.questoes_estudo); return { id: item.id, tipo: 'questao', titulo: question?.assunto || question?.disciplina || 'Questão respondida', data: item.created_at, resultado: item.correta ? 'acerto' : 'erro' } })

    return {
      metrics: { questoesRespondidas, acertos, erros, percentualAcerto: questoesRespondidas ? Math.round((acertos / questoesRespondidas) * 1000) / 10 : 0, tempoEstudado: simulados.reduce((total, item) => total + (item.tempo_total ?? 0), 0) + answers.reduce((total, item) => total + (item.tempo_gasto ?? 0), 0), simuladosRealizados: concluidos.length, questoesPendentesRevisao: null },
      recentActivities: [...simulationActivities, ...answerActivities].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()).slice(0, 5),
      performanceByDiscipline, performanceBySubject, difficultSubjects,
      evolution: concluidos.slice(0, 8).reverse().map((item) => ({ label: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(item.data_conclusao!)), value: (item.questoes_respondidas ?? 0) ? Math.round(((item.acertos ?? 0) / (item.questoes_respondidas ?? 1)) * 1000) / 10 : 0 })),
      continueStudying: emAndamento ? { id: emAndamento.id, titulo: emAndamento.assunto || emAndamento.disciplina || 'Simulado geral', respondidas: emAndamento.questoes_respondidas ?? 0, total: emAndamento.quantidade_questoes ?? 0 } : null,
      limitedMetrics: [...(answersUnavailable ? ['Respostas avulsas serão incluídas após a aplicação da migration da Fase 6.'] : []), 'Pendências de revisão serão incluídas na Fase 9.'],
    }
  }

  async getPerformancePanel(): Promise<PerformancePanel> {
    const { data, error } = await this.supabase.rpc('obter_painel_desempenho_seguro')
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883') throw new Error('A migration da Fase 10 ainda precisa ser aplicada no Supabase.')
      throw new Error('Não foi possível carregar o painel de desempenho.')
    }
    return data as unknown as PerformancePanel
  }
}

export const desempenhoService = new DesempenhoService()
