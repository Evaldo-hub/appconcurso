export type AiStudyAction = 'explicacao' | 'resumo' | 'aula' | 'mapa_mental' | 'pergunta'

export interface AiStudySource {
  titulo: string
  pagina: number | null
}

export interface AiStudyResponse {
  conteudo: string
  cached: boolean
  fontes?: AiStudySource[]
}

class AiStudyService {
  async studyQuestion(
    questionId: string,
    action: AiStudyAction,
    question?: string,
  ): Promise<AiStudyResponse> {
    const response = await fetch('/api/ai/study', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questao_id: Number(questionId),
        acao: action,
        session_id: getStudySessionId(),
        pergunta: question,
      }),
    })

    const data = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(data?.error || 'Não foi possível gerar o conteúdo.')
    }
    if (!data?.conteudo) {
      throw new Error('O serviço de IA retornou uma resposta vazia.')
    }
    return data as AiStudyResponse
  }
}

export const aiStudyService = new AiStudyService()

const STUDY_SESSION_KEY = 'estudo-ia-session-id'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getStudySessionId() {
  const current = window.sessionStorage.getItem(STUDY_SESSION_KEY)
  if (current && UUID_PATTERN.test(current)) return current

  const sessionId = crypto.randomUUID()
  window.sessionStorage.setItem(STUDY_SESSION_KEY, sessionId)
  return sessionId
}
