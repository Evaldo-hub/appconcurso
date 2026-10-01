'use client'

import { useEffect, useRef, useState } from 'react'
import { submitStudyAnswerAction } from '@/app/(dashboard)/questoes/gerar/actions'
import { StudyQuestionAnswerCard } from './study-question-answer-card'
import { beginStudyAnswer, confirmStudyAnswer, emptyStudyAnswerState, failStudyAnswer, selectStudyAnswer } from '@/lib/study/study-answer-state'
import type { PublicStudyQuestion } from '@/lib/study/public-study-question'

const persistenceError = 'Não foi possível registrar sua resposta. Tente novamente.'

export function ExistingStudyQuestion({ question }: { question: PublicStudyQuestion }) {
  const [state, setState] = useState(emptyStudyAnswerState)
  const startedAt = useRef<number | null>(null)
  useEffect(() => { startedAt.current = Date.now() }, [])
  const answer = async () => {
    if (!state.selected || state.pending || state.confirmed) return
    setState(beginStudyAnswer(state))
    try {
      const result = await submitStudyAnswerAction({ questao_id: question.id, alternativa_selecionada: state.selected, tempo_gasto: Math.min(86_400, Math.max(0, Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1_000))) })
      if (!result.ok) { setState(failStudyAnswer(state, result.code === 'AUTH_REQUIRED' ? 'Sua sessão expirou. Entre novamente.' : persistenceError)); return }
      setState(confirmStudyAnswer(state, result.answer))
    } catch { setState(failStudyAnswer(state, persistenceError)) }
  }
  return <StudyQuestionAnswerCard question={question} state={state} onSelect={(selected) => setState(selectStudyAnswer(selected))} onAnswer={() => void answer()} />
}
