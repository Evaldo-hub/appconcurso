import { createClient } from '@/lib/supabase/client'

export type AiStudyAction = 'explicacao' | 'resumo' | 'aula' | 'pergunta'
export interface AiStudyResponse { conteudo: string; cached: boolean; fontes?: Array<{ arquivo: string; pagina: number | null }> }

class N8nService {
  private supabase = createClient()
  async studyQuestion(questionId: string, action: AiStudyAction, question?: string): Promise<AiStudyResponse> {
    if (process.env.NEXT_PUBLIC_AI_GATEWAY === 'local') {
      const sessionId = getStudySessionId()
      const response = await fetch('/api/ai/study', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questao_id: Number(questionId), acao: action, session_id: sessionId, pergunta: question }) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Não foi possível acessar o gateway local de IA.')
      return data as AiStudyResponse
    }
    const { data, error } = await this.supabase.functions.invoke('estudo-ia', { body: { questao_id: Number(questionId), acao: action, pergunta: question } })
    if (error) throw new Error('Não foi possível acessar o serviço de IA. Verifique a implantação da Edge Function.')
    if (!data?.conteudo) throw new Error(data?.error || 'O serviço de IA retornou uma resposta vazia.')
    return data as AiStudyResponse
  }
}

export const n8nService = new N8nService()

const STUDY_SESSION_KEY = 'estudo-ia-session-id'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getStudySessionId() {
  const current = window.sessionStorage.getItem(STUDY_SESSION_KEY)
  if (current && UUID_PATTERN.test(current)) return current

  const sessionId = crypto.randomUUID()
  window.sessionStorage.setItem(STUDY_SESSION_KEY, sessionId)
  return sessionId
}
