'use client'

import { useEffect, useRef, useState } from 'react'
import { estudoService, type QuestionStudy, type StudyMode } from '@/services/estudo.service'
import { n8nService, type AiStudyAction } from '@/services/n8n.service'

export interface ChatMessage { pergunta: string; resposta: string }

export function useEstudoQuestao(questionId: string) {
  const [data, setData] = useState<QuestionStudy | null>(null); const [mode, setMode] = useState<StudyMode>('explicacao'); const [loading, setLoading] = useState(true); const [generating, setGenerating] = useState(false); const [error, setError] = useState<string | null>(null); const [generationError, setGenerationError] = useState<string | null>(null); const [messages, setMessages] = useState<ChatMessage[]>([])
  const requestInFlight = useRef(false)
  useEffect(() => { let active = true; estudoService.getQuestionStudy(questionId).then((study) => { if (active) { setData(study); setError(null) } }).catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o estudo.') }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [questionId])

  const generate = async (action: Exclude<AiStudyAction, 'pergunta'>) => {
    if (requestInFlight.current || !data) return
    requestInFlight.current = true
    setGenerating(true); setGenerationError(null)
    try { const result = await n8nService.studyQuestion(String(data.questao.id), action); setData((current) => current ? { ...current, conteudos: { ...current.conteudos, [action]: result.conteudo } } : current) }
    catch (generateError) { setGenerationError(generateError instanceof Error ? generateError.message : 'Não foi possível gerar o conteúdo.') }
    finally { requestInFlight.current = false; setGenerating(false) }
  }
  const ask = async (question: string) => {
    if (requestInFlight.current || !data) return false
    requestInFlight.current = true
    setGenerating(true); setGenerationError(null)
    try { const result = await n8nService.studyQuestion(String(data.questao.id), 'pergunta', question); setMessages((current) => [...current, { pergunta: question, resposta: result.conteudo }]); return true }
    catch (askError) { setGenerationError(askError instanceof Error ? askError.message : 'Não foi possível enviar a pergunta.'); return false }
    finally { requestInFlight.current = false; setGenerating(false) }
  }
  return { data, mode, setMode, loading, generating, error, generationError, messages, generate, ask }
}
