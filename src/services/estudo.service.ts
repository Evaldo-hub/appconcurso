import { createClient } from '@/lib/supabase/client'

export type StudyMode = 'explicacao' | 'resumo' | 'aula' | 'perguntar'
export interface StudySource { id: number; arquivo: string; pagina: number | null }
export interface QuestionStudy { questao: { id: number; disciplina: string; assunto: string; subassunto: string | null; enunciado: string }; conteudos: { explicacao: string | null; resumo: string | null; aula: string | null }; fontes: StudySource[] }

class EstudoService {
  private supabase = createClient()
  async getQuestionStudy(questionId: string): Promise<QuestionStudy> {
    const { data, error } = await this.supabase.rpc('obter_estudo_questao_seguro', { p_questao_id: Number(questionId) })
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883') throw new Error('A migration da Fase 11 ainda precisa ser aplicada no Supabase.')
      if (error.code === '42501') throw new Error(error.message)
      throw new Error('Não foi possível carregar o conteúdo de estudo.')
    }
    return data as unknown as QuestionStudy
  }
}

export const estudoService = new EstudoService()
