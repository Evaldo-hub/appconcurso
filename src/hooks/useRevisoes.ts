'use client'

import { useEffect, useRef, useState } from 'react'
import { revisoesService, type ReviewCategory, type ReviewItem, type ReviewSession, type ReviewSessionSummary } from '@/services/revisoes.service'
import type { AnswerResult } from '@/services/questoes.service'

export function useRevisoes() {
  const [items, setItems] = useState<ReviewItem[]>([]); const [sessions, setSessions] = useState<ReviewSessionSummary[]>([]); const [loading, setLoading] = useState(true); const [creating, setCreating] = useState(false); const [error, setError] = useState<string | null>(null)
  useEffect(() => { let active = true; Promise.all([revisoesService.list(), revisoesService.listSessions()]).then(([newItems, newSessions]) => { if (active) { setItems(newItems); setSessions(newSessions); setError(null) } }).catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as revisões.') }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [])
  const createSession = async (category: ReviewCategory, limit: number) => { setCreating(true); setError(null); try { return await revisoesService.createSession(category, limit) } catch (createError) { setError(createError instanceof Error ? createError.message : 'Não foi possível criar a revisão.'); return null } finally { setCreating(false) } }
  return { items, sessions, loading, creating, error, createSession }
}

export function useReviewSession(id: string) {
  const [session, setSession] = useState<ReviewSession | null>(null); const [index, setIndex] = useState(0); const [selected, setSelected] = useState<string | null>(null); const [result, setResult] = useState<AnswerResult | null>(null); const [loading, setLoading] = useState(true); const [answering, setAnswering] = useState(false); const [error, setError] = useState<string | null>(null); const startedAt = useRef<number | null>(null)
  useEffect(() => { let active = true; revisoesService.getSession(id).then((loaded) => { if (active) { setSession(loaded); startedAt.current = Date.now() } }).catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Não foi possível abrir a revisão.') }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [id])
  const current = session?.questions[index] ?? null
  const goTo = (newIndex: number) => { setIndex(newIndex); setSelected(null); setResult(null); startedAt.current = Date.now() }
  const answer = async () => { if (!current || !selected) return; setAnswering(true); setError(null); try { const elapsed = startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : 0; setResult(await revisoesService.answer(current.id, selected, elapsed)) } catch (answerError) { setError(answerError instanceof Error ? answerError.message : 'Não foi possível responder.') } finally { setAnswering(false) } }
  const complete = async () => { try { await revisoesService.completeSession(id); return true } catch (completeError) { setError(completeError instanceof Error ? completeError.message : 'Não foi possível concluir.'); return false } }
  return { session, current, index, selected, result, loading, answering, error, select: setSelected, answer, previous: () => goTo(Math.max(0, index - 1)), next: () => goTo(Math.min((session?.questions.length ?? 1) - 1, index + 1)), complete }
}
