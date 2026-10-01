'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { emptyQuestionFilters, questoesService, type AnswerResult, type QuestionFilters, type QuestionPage } from '@/services/questoes.service'
import { revisoesService, type QuestionReviewState } from '@/services/revisoes.service'
import { deriveQuestionBankOptions, updateQuestionFilter, type QuestionBankFilterData } from '@/lib/questions/question-filter-catalog'

const emptyFilterData: QuestionBankFilterData = { concursos: [], provas: [], catalogo: [], dificuldades: [] }

export function useQuestoes() {
  const [draftFilters, setDraftFilters] = useState<QuestionFilters>(emptyQuestionFilters)
  const [appliedFilters, setAppliedFilters] = useState<QuestionFilters>(emptyQuestionFilters)
  const [filterData, setFilterData] = useState<QuestionBankFilterData>(emptyFilterData)
  const [catalog, setCatalog] = useState<QuestionBankFilterData['catalogo']>([])
  const [page, setPage] = useState<QuestionPage>({ question: null, total: 0 })
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [requestVersion, setRequestVersion] = useState(0)
  const [selectedAlternative, setSelectedAlternative] = useState<string | null>(null)
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null)
  const [answering, setAnswering] = useState(false)
  const [answerError, setAnswerError] = useState<string | null>(null)
  const [reviewState, setReviewState] = useState<QuestionReviewState>({ favorita: false, marcada: false })
  const [savingReview, setSavingReview] = useState(false)
  const startedAt = useRef<number | null>(null)
  const urlFiltersApplied = useRef(false)

  useEffect(() => {
    if (urlFiltersApplied.current) return
    urlFiltersApplied.current = true
    const params = new URLSearchParams(window.location.search)
    const fromUrl: QuestionFilters = {
      ...emptyQuestionFilters,
      concursoId: params.get('concurso') ?? '',
      disciplina: params.get('disciplina') ?? '',
      assunto: params.get('assunto') ?? '',
      subassunto: params.get('subassunto') ?? '',
      provaId: params.get('prova') ?? '',
      banca: params.get('banca') ?? '',
      ids: params.get('ids') ?? '',
    }
    if (fromUrl.concursoId || fromUrl.provaId || fromUrl.disciplina || fromUrl.assunto || fromUrl.subassunto || fromUrl.banca || fromUrl.ids) {
      const timeout = window.setTimeout(() => {
        setDraftFilters(fromUrl)
        setAppliedFilters(fromUrl)
        setLoading(true)
      }, 0)
      return () => window.clearTimeout(timeout)
    }
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([questoesService.getQuestionBankFilterData(), questoesService.getQuestion(appliedFilters, index)])
      .then(([newFilterData, newPage]) => { if (active) { setFilterData(newFilterData); setPage(newPage); setError(null); startedAt.current = Date.now() } })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as questões.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [appliedFilters, index, requestVersion])

  useEffect(() => {
    if (!draftFilters.concursoId || !draftFilters.provaId) return

    let active = true
    questoesService.getQuestionCatalog(draftFilters.concursoId, draftFilters.provaId)
      .then((newCatalog) => { if (active) setCatalog(newCatalog) })
      .catch((catalogError: unknown) => { if (active) setError(catalogError instanceof Error ? catalogError.message : 'Não foi possível carregar o catálogo.') })
    return () => { active = false }
  }, [draftFilters.concursoId, draftFilters.provaId])

  useEffect(() => {
    const questionId = page.question?.id
    if (!questionId) return
    let active = true
    revisoesService.getQuestionState(questionId).then((state) => { if (active) setReviewState(state) })
    return () => { active = false }
  }, [page.question?.id])

  const resetAnswer = () => { setSelectedAlternative(null); setAnswerResult(null); setAnswerError(null); startedAt.current = Date.now() }
  const options = useMemo(() => deriveQuestionBankOptions({ ...filterData, catalogo: catalog }, draftFilters), [catalog, draftFilters, filterData])
  const updateFilter = (field: keyof QuestionFilters, value: string) => {
    if (field === 'concursoId' || field === 'provaId') setCatalog([])
    setDraftFilters((current) => {
      const contestBoard = field === 'concursoId' ? filterData.concursos.find((contest) => contest.value === value)?.banca ?? '' : ''
      return updateQuestionFilter(current, field, value, contestBoard)
    })
  }
  const applyFilters = () => { resetAnswer(); setLoading(true); setIndex(0); setAppliedFilters(draftFilters) }
  const clearFilters = () => { resetAnswer(); setLoading(true); setIndex(0); setCatalog([]); setDraftFilters(emptyQuestionFilters); setAppliedFilters(emptyQuestionFilters) }
  const reload = () => { setLoading(true); setRequestVersion((value) => value + 1) }
  const previous = () => { resetAnswer(); setLoading(true); setIndex((value) => Math.max(0, value - 1)) }
  const next = () => { resetAnswer(); setLoading(true); setIndex((value) => Math.min(page.total - 1, value + 1)) }

  const answer = async () => {
    if (!page.question || !selectedAlternative || answerResult) return
    setAnswering(true)
    setAnswerError(null)
    try {
      const elapsed = startedAt.current === null ? 0 : Math.max(0, Math.round((Date.now() - startedAt.current) / 1000))
      setAnswerResult(await questoesService.answerQuestion(page.question.id, selectedAlternative, elapsed))
    } catch (submitError) {
      setAnswerError(submitError instanceof Error ? submitError.message : 'Não foi possível registrar sua resposta.')
    } finally {
      setAnswering(false)
    }
  }

  const toggleFavorite = async () => { if (!page.question || savingReview) return; const active = !reviewState.favorita; setSavingReview(true); try { await revisoesService.setFavorite(page.question.id, active); setReviewState((state) => ({ ...state, favorita: active })) } catch (reviewError) { setAnswerError(reviewError instanceof Error ? reviewError.message : 'Não foi possível atualizar a favorita.') } finally { setSavingReview(false) } }
  const toggleReview = async () => { if (!page.question || savingReview) return; const active = !reviewState.marcada; setSavingReview(true); try { await revisoesService.setReview(page.question.id, active); setReviewState((state) => ({ ...state, marcada: active })) } catch (reviewError) { setAnswerError(reviewError instanceof Error ? reviewError.message : 'Não foi possível atualizar a revisão.') } finally { setSavingReview(false) } }

  return { draftFilters, options, page, index, loading, error, selectedAlternative, answerResult, answering, answerError, reviewState, savingReview, updateFilter, applyFilters, clearFilters, selectAlternative: setSelectedAlternative, answer, toggleFavorite, toggleReview, previous, next, reload }
}
