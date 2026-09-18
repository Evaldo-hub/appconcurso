import { createClient } from '@/lib/supabase/client'
import { questoesService, type QuestionFilterOptions } from '@/services/questoes.service'

export interface SimuladoConfig { concursoId: string; disciplina: string; assunto: string; quantidade: number; cronometro: boolean }
export interface SimuladoSummary { id: string; disciplina: string | null; assunto: string | null; quantidade: number; respondidas: number; acertos: number; erros: number; status: string; criadoEm: string; concluidoEm: string | null; tempoTotal: number | null }
export interface SimuladoQuestion { id: string; ordem: number; disciplina: string; assunto: string; subassunto: string | null; enunciado: string; alternativas: { letra: string; texto: string }[] }
export interface SimuladoSession { id: string; disciplina: string | null; assunto: string | null; cronometro: boolean; status: string; questions: SimuladoQuestion[]; answers: Record<string, string> }
export interface ResultQuestion extends SimuladoQuestion { dificuldade: string | null; alternativaSelecionada: string | null; correta: boolean; alternativaCorreta: string; explicacao: string | null }
export interface ResultBreakdown { label: string; total: number; acertos: number; percentual: number }
export interface SimuladoResult { summary: SimuladoSummary; questions: ResultQuestion[]; byDiscipline: ResultBreakdown[]; bySubject: ResultBreakdown[]; byDifficulty: ResultBreakdown[] }

interface QuestionRelation { id: string; disciplina: string; assunto: string; subassunto: string | null; enunciado: string; alternativa_a: string; alternativa_b: string; alternativa_c: string; alternativa_d: string; alternativa_e: string }
interface SimuladoQuestionRow { ordem: number; questao_id: string; questoes_estudo: QuestionRelation | QuestionRelation[] | null }
interface ResultRow { ordem: number; questao_id: number; disciplina: string; assunto: string; subassunto: string | null; dificuldade: string | null; enunciado: string; alternativa_a: string; alternativa_b: string; alternativa_c: string; alternativa_d: string; alternativa_e: string; alternativa_selecionada: string | null; correta: boolean; alternativa_correta: string; explicacao: string | null }
const firstRelation = <T,>(relation: T | T[] | null): T | null => Array.isArray(relation) ? relation[0] ?? null : relation
function breakdown(questions: ResultQuestion[], field: 'disciplina' | 'assunto' | 'dificuldade'): ResultBreakdown[] {
  const groups = new Map<string, { total: number; acertos: number }>()
  questions.forEach((question) => { const label = question[field] || 'Não informado'; const current = groups.get(label) ?? { total: 0, acertos: 0 }; current.total += 1; current.acertos += question.correta ? 1 : 0; groups.set(label, current) })
  return Array.from(groups, ([label, values]) => ({ label, ...values, percentual: values.total ? Math.round((values.acertos / values.total) * 1000) / 10 : 0 })).sort((a, b) => b.total - a.total)
}

class SimuladosService {
  private supabase = createClient()

  getOptions(): Promise<QuestionFilterOptions> { return questoesService.getFilterOptions() }

  async list(): Promise<SimuladoSummary[]> {
    const { data, error } = await this.supabase.from('simulados').select('id, disciplina, assunto, quantidade_questoes, questoes_respondidas, acertos, erros, status, data_criacao, data_conclusao, tempo_total').order('data_criacao', { ascending: false }).limit(20)
    if (error) {
      if (error.code === '42703') throw new Error('A migration da Fase 7 ainda precisa ser aplicada no Supabase.')
      throw new Error('Não foi possível carregar seus simulados.')
    }
    return (data ?? []).map((item) => ({ id: String(item.id), disciplina: item.disciplina, assunto: item.assunto, quantidade: item.quantidade_questoes, respondidas: item.questoes_respondidas, acertos: item.acertos, erros: item.erros, status: item.status, criadoEm: item.data_criacao, concluidoEm: item.data_conclusao, tempoTotal: item.tempo_total }))
  }

  async create(config: SimuladoConfig): Promise<string> {
    const { data, error } = await this.supabase.rpc('criar_simulado', { p_concurso_id: config.concursoId ? Number(config.concursoId) : null, p_disciplina: config.disciplina || null, p_assunto: config.assunto || null, p_quantidade: config.quantidade, p_cronometro: config.cronometro })
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883') throw new Error('A migration da Fase 7 ainda precisa ser aplicada no Supabase.')
      if (error.message.includes('Questões insuficientes')) throw new Error(error.message)
      throw new Error('Não foi possível criar o simulado.')
    }
    return String(data)
  }

  async get(id: string): Promise<SimuladoSession> {
    const [simulationResult, questionsResult, answersResult] = await Promise.all([
      this.supabase.from('simulados').select('id, disciplina, assunto, cronometro, status').eq('id', id).single(),
      this.supabase.from('simulado_questoes').select('ordem, questao_id, questoes_estudo(id, disciplina, assunto, subassunto, enunciado, alternativa_a, alternativa_b, alternativa_c, alternativa_d, alternativa_e)').eq('simulado_id', id).order('ordem'),
      this.supabase.from('respostas_simulado').select('questao_id, alternativa_selecionada').eq('simulado_id', id),
    ])
    const error = simulationResult.error || questionsResult.error || answersResult.error
    if (error) throw new Error(error.code === '42703' ? 'A migration da Fase 7 ainda precisa ser aplicada no Supabase.' : 'Não foi possível abrir este simulado.')

    const questions = (questionsResult.data ?? [] as unknown[]) as unknown as SimuladoQuestionRow[]
    return {
      id: String(simulationResult.data.id), disciplina: simulationResult.data.disciplina, assunto: simulationResult.data.assunto,
      cronometro: simulationResult.data.cronometro, status: simulationResult.data.status,
      questions: questions.map((item) => { const q = firstRelation(item.questoes_estudo)!; return { id: String(q.id), ordem: item.ordem, disciplina: q.disciplina, assunto: q.assunto, subassunto: q.subassunto, enunciado: q.enunciado, alternativas: [{ letra: 'A', texto: q.alternativa_a }, { letra: 'B', texto: q.alternativa_b }, { letra: 'C', texto: q.alternativa_c }, { letra: 'D', texto: q.alternativa_d }, { letra: 'E', texto: q.alternativa_e }].filter((option) => Boolean(option.texto)) } }),
      answers: Object.fromEntries((answersResult.data ?? []).filter((item) => item.alternativa_selecionada).map((item) => [String(item.questao_id), item.alternativa_selecionada])),
    }
  }

  async saveAnswer(simuladoId: string, questionId: string, alternative: string, elapsed: number) {
    const { error } = await this.supabase.rpc('salvar_resposta_simulado', { p_simulado_id: Number(simuladoId), p_questao_id: Number(questionId), p_alternativa: alternative, p_tempo_gasto: elapsed })
    if (error) throw new Error('Não foi possível salvar esta resposta.')
  }

  async finish(simuladoId: string, totalTime: number) {
    const { error } = await this.supabase.rpc('finalizar_simulado', { p_simulado_id: Number(simuladoId), p_tempo_total: totalTime })
    if (error) throw new Error('Não foi possível finalizar o simulado.')
  }

  async getResult(id: string): Promise<SimuladoResult> {
    const [summaryResult, questionsResult] = await Promise.all([
      this.supabase.from('simulados').select('id, disciplina, assunto, quantidade_questoes, questoes_respondidas, acertos, erros, status, data_criacao, data_conclusao, tempo_total').eq('id', id).single(),
      this.supabase.rpc('obter_resultado_simulado_seguro', { p_simulado_id: Number(id) }),
    ])
    const error = summaryResult.error || questionsResult.error
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883') throw new Error('A migration da Fase 8 ainda precisa ser aplicada no Supabase.')
      throw new Error('Não foi possível carregar o resultado deste simulado.')
    }
    const item = summaryResult.data
    const summary: SimuladoSummary = { id: String(item.id), disciplina: item.disciplina, assunto: item.assunto, quantidade: item.quantidade_questoes, respondidas: item.questoes_respondidas, acertos: item.acertos, erros: item.erros, status: item.status, criadoEm: item.data_criacao, concluidoEm: item.data_conclusao, tempoTotal: item.tempo_total }
    const questions = ((questionsResult.data ?? []) as unknown as ResultRow[]).map((row) => ({
      id: String(row.questao_id), ordem: row.ordem, disciplina: row.disciplina, assunto: row.assunto, subassunto: row.subassunto, dificuldade: row.dificuldade, enunciado: row.enunciado,
      alternativas: [{ letra: 'A', texto: row.alternativa_a }, { letra: 'B', texto: row.alternativa_b }, { letra: 'C', texto: row.alternativa_c }, { letra: 'D', texto: row.alternativa_d }, { letra: 'E', texto: row.alternativa_e }].filter((option) => Boolean(option.texto)),
      alternativaSelecionada: row.alternativa_selecionada, correta: row.correta, alternativaCorreta: row.alternativa_correta, explicacao: row.explicacao,
    }))
    return { summary, questions, byDiscipline: breakdown(questions, 'disciplina'), bySubject: breakdown(questions, 'assunto'), byDifficulty: breakdown(questions, 'dificuldade') }
  }

  async retryErrors(id: string): Promise<string> {
    const { data, error } = await this.supabase.rpc('refazer_erros_simulado', { p_simulado_id: Number(id) })
    if (error) throw new Error(error.message.includes('não possui erros') ? error.message : 'Não foi possível criar o simulado de revisão.')
    return String(data)
  }
}

export const simuladosService = new SimuladosService()
