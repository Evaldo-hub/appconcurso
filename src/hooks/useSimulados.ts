'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { simuladosService, type SimuladoConfig, type SimuladoResult, type SimuladoSession, type SimuladoSummary } from '@/services/simulados.service'
import type { QuestionFilterOptions } from '@/services/questoes.service'

const emptyOptions: QuestionFilterOptions = { concursos: [], provas: [], bancas: [], disciplinas: [], assuntos: [], subassuntos: [], dificuldades: [] }
export const initialSimuladoConfig: SimuladoConfig = { concursoId: '', disciplina: '', assunto: '', quantidade: 10, cronometro: false }

export function useSimulados() {
  const [options, setOptions] = useState(emptyOptions)
  const [items, setItems] = useState<SimuladoSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([simuladosService.getOptions(), simuladosService.list()])
      .then(([newOptions, newItems]) => { if (active) { setOptions(newOptions); setItems(newItems); setError(null) } })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os simulados.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const create = async (config: SimuladoConfig) => {
    setCreating(true); setError(null)
    try { return await simuladosService.create(config) }
    catch (createError) { setError(createError instanceof Error ? createError.message : 'Não foi possível criar o simulado.'); return null }
    finally { setCreating(false) }
  }
  return { options, items, loading, creating, error, create }
}

export function useSimulado(id: string) {
  const [session, setSession] = useState<SimuladoSession | null>(null)
  const [index, setIndex] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const questionStartedAt = useRef<number | null>(null)

  useEffect(() => {
    let active = true
    simuladosService.get(id)
      .then((loaded) => { if (active) { setSession(loaded); setError(null); questionStartedAt.current = Date.now() } })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Não foi possível abrir o simulado.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id])

  useEffect(() => {
    if (!session || session.status !== 'em_andamento') return
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [session])

  const current = session?.questions[index] ?? null
  const answeredCount = useMemo(() => Object.keys(session?.answers ?? {}).length, [session?.answers])
  const goTo = (newIndex: number) => { setIndex(newIndex); questionStartedAt.current = Date.now() }

  const selectAnswer = async (alternative: string) => {
    if (!session || !current || saving) return
    setSaving(true); setError(null)
    const elapsed = questionStartedAt.current === null ? 0 : Math.max(0, Math.round((Date.now() - questionStartedAt.current) / 1000))
    try {
      await simuladosService.saveAnswer(session.id, current.id, alternative, elapsed)
      setSession((value) => value ? { ...value, answers: { ...value.answers, [current.id]: alternative } } : value)
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar a resposta.') }
    finally { setSaving(false) }
  }

  const finish = async () => {
    if (!session) return false
    setFinishing(true); setError(null)
    try { await simuladosService.finish(session.id, seconds); return true }
    catch (finishError) { setError(finishError instanceof Error ? finishError.message : 'Não foi possível finalizar o simulado.'); return false }
    finally { setFinishing(false) }
  }

  return { session, current, index, seconds, answeredCount, loading, saving, finishing, error, selectAnswer, previous: () => goTo(Math.max(0, index - 1)), next: () => goTo(Math.min((session?.questions.length ?? 1) - 1, index + 1)), goTo, finish }
}

export function useSimuladoResult(id: string) {
  const [result, setResult] = useState<SimuladoResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    simuladosService.getResult(id)
      .then((loaded) => { if (active) { setResult(loaded); setError(null) } })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o resultado.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id])

  return { result, loading, error }
}
