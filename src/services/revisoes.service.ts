import { createClient } from '@/lib/supabase/client'
import { questoesService, type AnswerResult } from '@/services/questoes.service'

export type ReviewCategory = 'todas' | 'erradas' | 'favoritas' | 'marcadas' | 'baixo_desempenho'
export interface ReviewItem { id: string; disciplina: string; assunto: string; subassunto: string | null; enunciado: string; errada: boolean; favorita: boolean; marcada: boolean; baixoDesempenho: boolean }
export interface QuestionReviewState { favorita: boolean; marcada: boolean }
export interface ReviewSessionSummary { id: string; titulo: string; categoria: ReviewCategory; status: string; criadoEm: string }
export interface ReviewQuestion { id: string; ordem: number; disciplina: string; assunto: string; subassunto: string | null; enunciado: string; alternativas: { letra: string; texto: string }[] }
export interface ReviewSession { id: string; titulo: string; status: string; questions: ReviewQuestion[] }

interface ReviewRow { questao_id: number; disciplina: string; assunto: string; subassunto: string | null; enunciado: string; errada: boolean; favorita: boolean; marcada: boolean; baixo_desempenho: boolean }
interface QuestionRelation { id: number; disciplina: string; assunto: string; subassunto: string | null; enunciado: string; alternativa_a: string; alternativa_b: string; alternativa_c: string; alternativa_d: string; alternativa_e: string }
interface SessionQuestionRow { ordem: number; questoes_estudo: QuestionRelation | QuestionRelation[] | null }
const firstRelation = <T,>(relation: T | T[] | null): T | null => Array.isArray(relation) ? relation[0] ?? null : relation

class RevisoesService {
  private supabase = createClient()

  async list(): Promise<ReviewItem[]> {
    const { data, error } = await this.supabase.rpc('listar_revisoes')
    if (error) throw new Error(error.code === 'PGRST202' ? 'A migration da Fase 9 ainda precisa ser aplicada no Supabase.' : 'Não foi possível carregar suas revisões.')
    return ((data ?? []) as unknown as ReviewRow[]).map((item) => ({ id: String(item.questao_id), disciplina: item.disciplina, assunto: item.assunto, subassunto: item.subassunto, enunciado: item.enunciado, errada: item.errada, favorita: item.favorita, marcada: item.marcada, baixoDesempenho: item.baixo_desempenho }))
  }

  async listSessions(): Promise<ReviewSessionSummary[]> {
    const { data, error } = await this.supabase.from('sessoes_revisao').select('id, titulo, categoria, status, created_at').order('created_at', { ascending: false }).limit(10)
    if (error) throw new Error('Não foi possível carregar as sessões de revisão.')
    return (data ?? []).map((item) => ({ id: String(item.id), titulo: item.titulo, categoria: item.categoria as ReviewCategory, status: item.status, criadoEm: item.created_at }))
  }

  async getQuestionState(questionId: string): Promise<QuestionReviewState> {
    const [favorite, review] = await Promise.all([
      this.supabase.from('questoes_favoritas').select('questao_id').eq('questao_id', questionId).maybeSingle(),
      this.supabase.from('questoes_revisao').select('questao_id').eq('questao_id', questionId).maybeSingle(),
    ])
    if (favorite.error || review.error) return { favorita: false, marcada: false }
    return { favorita: Boolean(favorite.data), marcada: Boolean(review.data) }
  }

  async setFavorite(questionId: string, active: boolean) { const { error } = await this.supabase.rpc('definir_questao_favorita', { p_questao_id: Number(questionId), p_ativa: active }); if (error) throw new Error('Não foi possível atualizar a questão favorita.') }
  async setReview(questionId: string, active: boolean) { const { error } = await this.supabase.rpc('definir_questao_revisao', { p_questao_id: Number(questionId), p_ativa: active, p_motivo: 'importante' }); if (error) throw new Error('Não foi possível atualizar a marcação de revisão.') }

  async createSession(category: ReviewCategory, limit: number): Promise<string> {
    const { data, error } = await this.supabase.rpc('criar_sessao_revisao', { p_categoria: category, p_limite: limit })
    if (error) throw new Error(error.message.includes('Nenhuma questão') ? error.message : 'Não foi possível criar a sessão de revisão.')
    return String(data)
  }

  async getSession(id: string): Promise<ReviewSession> {
    const [sessionResult, questionsResult] = await Promise.all([
      this.supabase.from('sessoes_revisao').select('id, titulo, status').eq('id', id).single(),
      this.supabase.from('sessao_revisao_questoes').select('ordem, questoes_estudo(id, disciplina, assunto, subassunto, enunciado, alternativa_a, alternativa_b, alternativa_c, alternativa_d, alternativa_e)').eq('sessao_id', id).order('ordem'),
    ])
    const error = sessionResult.error || questionsResult.error
    if (error) throw new Error('Não foi possível abrir esta sessão de revisão.')
    const questions = (questionsResult.data ?? []) as unknown as SessionQuestionRow[]
    return { id: String(sessionResult.data.id), titulo: sessionResult.data.titulo, status: sessionResult.data.status, questions: questions.map((item) => { const q = firstRelation(item.questoes_estudo)!; return { id: String(q.id), ordem: item.ordem, disciplina: q.disciplina, assunto: q.assunto, subassunto: q.subassunto, enunciado: q.enunciado, alternativas: [{ letra: 'A', texto: q.alternativa_a }, { letra: 'B', texto: q.alternativa_b }, { letra: 'C', texto: q.alternativa_c }, { letra: 'D', texto: q.alternativa_d }, { letra: 'E', texto: q.alternativa_e }].filter((option) => Boolean(option.texto)) } }) }
  }

  answer(questionId: string, alternative: string, elapsed: number): Promise<AnswerResult> { return questoesService.answerQuestion(questionId, alternative, elapsed) }
  async completeSession(id: string) { const { error } = await this.supabase.rpc('concluir_sessao_revisao', { p_sessao_id: Number(id) }); if (error) throw new Error('Não foi possível concluir a revisão.') }
}

export const revisoesService = new RevisoesService()
