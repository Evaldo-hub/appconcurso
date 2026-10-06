'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRagSelectionCatalog } from '@/lib/study/rag-selection-catalog'
import { createStudyQuestionFlow, generateStudyQuestionBatch, StudyQuestionAttemptError, type SafeStudyQuestion, type StudyQuestionInput } from '@/lib/study/generate-study-question'
import { RagRetrievalError, retrieveRagContext } from '@/lib/rag/retrieval'
import { createRagGenerationContextBuilder } from '@/lib/rag/generation-context'
import { createRagQuestionGenerator, generateRagQuestionWithProviderFallback, QuestionAiUnavailableError } from '@/lib/rag/question-generator'
import { validateSourceCitationIntegrity } from '@/lib/rag/generated-question'
import { RagQuestionValidationError, validateRagGeneratedQuestion } from '@/lib/rag/question-validator'
import { logRagQuestionPersistenceFailure, persistApprovedRagQuestion } from '@/lib/rag/question-persistence'
import { GeminiGenerationError } from '@/lib/ai/gemini'
import { classifyGeminiGenerationFailure, logStudyRagProviderError } from '@/lib/ai/gemini-provider-diagnostics'
import { createSubmitStudyAnswer, type AnswerLetter, type StudyAnswerPersistenceResult } from '@/lib/study/submit-study-answer'

async function executeProductionBatch(input: StudyQuestionInput, board: string) {
  const query = [input.assunto, input.subassunto].filter(Boolean).join(' — ')
  console.info('study_rag_batch', { event: 'retrieval_started', requested_quantity: input.quantidade, concurso_id: input.concurso_id, prova_id: input.prova_id })
  let retrieval
  try {
    retrieval = await retrieveRagContext({ query, concursoId: input.concurso_id, provaId: input.prova_id, disciplina: input.disciplina, assunto: input.assunto, subassunto: input.subassunto })
  } catch (error) {
    console.error('study_rag_batch', {
      event: 'retrieval_failed',
      error_name: error instanceof Error ? error.name : 'UnknownRetrievalError',
      message: error instanceof RagRetrievalError ? error.message : 'Retrieval failure without structured diagnostics.',
    })
    throw error
  }
  if (retrieval.matches.length === 0) throw new Error('NO_RAG_CONTEXT')
  if (retrieval.matches.some((source) => source.provaId !== null && source.provaId !== input.prova_id)) throw new Error('INVALID_RETRIEVAL_SCOPE')
  const context = await createRagGenerationContextBuilder(async () => retrieval)({ query, concursoId: input.concurso_id, provaId: input.prova_id })
  console.info('study_rag_batch', { event: 'retrieval_finished', source_count: context.sourceCount, retrieval_strategy: 'SHARED_REQUEST_CONTEXT' })

  const generator = createRagQuestionGenerator({ buildContext: async () => context, generate: generateRagQuestionWithProviderFallback })

  const result = await generateStudyQuestionBatch(input.quantidade, async (attempt): Promise<SafeStudyQuestion> => {
    console.info('study_rag_batch', { event: 'attempt_started', attempt_number: attempt })
    let generated
    try {
      generated = await generator({ query, concursoId: input.concurso_id, provaId: input.prova_id, disciplina: input.disciplina, assunto: input.assunto, subassunto: input.subassunto, banca: board, dificuldade: 'media', numeroQuestao: attempt })
    } catch (error) {
      console.info('study_rag_batch', { event: 'generation_result', attempt_number: attempt, passed: false })
      if (error instanceof GeminiGenerationError) logStudyRagProviderError('question_generation', error)
      throw new StudyQuestionAttemptError(error instanceof QuestionAiUnavailableError ? 'AI_PROVIDER_UNAVAILABLE' : classifyGeminiGenerationFailure(error))
    }
    const citation = validateSourceCitationIntegrity(generated.question)
    console.info('study_rag_batch', { event: 'generation_result', attempt_number: attempt, passed: true, model: generated.generation.model })
    console.info('study_rag_batch', { event: 'structural_result', attempt_number: attempt, passed: true })
    console.info('study_rag_batch', { event: 'citation_result', attempt_number: attempt, passed: citation.valid })
    if (!citation.valid) throw new StudyQuestionAttemptError('REJECTED')

    let semantic
    try { semantic = await validateRagGeneratedQuestion({ question: generated.question, resolvedSources: generated.resolvedSources }) }
    catch (error) {
      if (!(error instanceof RagQuestionValidationError)) logStudyRagProviderError('semantic_validation', error)
      throw new StudyQuestionAttemptError(error instanceof RagQuestionValidationError ? 'REJECTED' : 'PROVIDER_FAILURE')
    }
    console.info('study_rag_batch', { event: 'semantic_result', attempt_number: attempt, verdict: semantic.finalVerdict, model: semantic.validation.model })
    if (semantic.finalVerdict !== 'approved') throw new StudyQuestionAttemptError('REJECTED')

    let persistence
    console.info('study_rag_persistence', {
      event: 'persistence_started', rpc: 'persistir_questao_rag_aprovada',
      concurso_id: input.concurso_id, prova_id: input.prova_id, source_count: generated.resolvedSources.length,
    })
    try { persistence = await persistApprovedRagQuestion({ question: generated.question, resolvedSources: generated.resolvedSources, semanticValidation: semantic, concursoId: input.concurso_id, provaId: input.prova_id }) }
    catch (error) {
      logRagQuestionPersistenceFailure(error, {
        concursoId: input.concurso_id, provaId: input.prova_id, sourceCount: generated.resolvedSources.length,
        sourceProofIds: generated.resolvedSources.map((source) => source.provaId),
      })
      throw new StudyQuestionAttemptError('PERSISTENCE_FAILURE')
    }
    console.info('study_rag_batch', { event: 'persistence_result', attempt_number: attempt, status: persistence.status, questao_id: persistence.questaoId })
    return {
      attempt, questao_id: persistence.questaoId, status: persistence.status === 'cadastrada' ? 'created' : 'duplicate',
      disciplina: generated.question.disciplina, assunto: generated.question.assunto, subassunto: generated.question.subassunto,
      banca: generated.question.banca, dificuldade: generated.question.dificuldade, enunciado: generated.question.enunciado,
      alternativas: generated.question.alternativas,
    }
  })
  console.info('study_rag_batch', { event: 'batch_final_status', status: result.status, generated_count: result.generatedCount, attempts: result.attempts, stopped_reason: result.stoppedReason })
  return result
}

const flow = createStudyQuestionFlow({
  async authenticate() {
    const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser()
    console.info('study_rag_batch', { event: 'user_authenticated', authenticated: Boolean(user) }); return Boolean(user)
  },
  async resolveSelection(input) {
    const result = await loadRagSelectionCatalog(); if (result.error) return { valid: false, board: '' }
    const contest = result.catalog.contests.find((item) => item.id === input.concurso_id)
    const examValid = result.catalog.exams.some((item) => item.id === input.prova_id && item.contestId === input.concurso_id)
    const taxonomyValid = result.catalog.taxonomy.some((item) => item.contestId === input.concurso_id && item.examId === input.prova_id && item.discipline === input.disciplina && item.subject === input.assunto && (input.subassunto === null || item.subsubject === input.subassunto))
    return { valid: Boolean(contest && examValid && taxonomyValid), board: contest?.board ?? '' }
  },
  executeBatch: executeProductionBatch,
})

export async function generateStudyQuestionAction(input: unknown) { return flow(input) }

function parseRpcAnswer(data: unknown): StudyAnswerPersistenceResult {
  const candidate = Array.isArray(data) && data.length === 1 ? data[0] : data
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('INVALID_ANSWER_RPC_RESULT')
  const row = candidate as Record<string, unknown>
  if (!Number.isSafeInteger(row.resposta_id) || Number(row.resposta_id) <= 0 || typeof row.correta !== 'boolean'
    || typeof row.alternativa_correta !== 'string' || !['A', 'B', 'C', 'D', 'E'].includes(row.alternativa_correta)) {
    throw new Error('INVALID_ANSWER_RPC_RESULT')
  }
  return { respostaId: Number(row.resposta_id), correct: row.correta, correctAnswer: row.alternativa_correta as AnswerLetter }
}

export async function submitStudyAnswerAction(input: unknown) {
  const supabase = await createClient()
  const admin = createAdminClient()
  const submit = createSubmitStudyAnswer({
    async authenticate() {
      const { data: { user } } = await supabase.auth.getUser()
      return user ? { userId: user.id } : null
    },
    async findQuestion(questionId) {
      const { data, error } = await admin.from('questoes_estudo').select('id,gabarito,explicacao').eq('id', questionId).maybeSingle()
      if (error) throw error
      if (!data) return null
      const correctAnswer = String(data.gabarito).trim().toUpperCase()
      if (!['A', 'B', 'C', 'D', 'E'].includes(correctAnswer)) throw new Error('INVALID_STORED_ANSWER')
      return { id: Number(data.id), correctAnswer: correctAnswer as AnswerLetter, explanation: String(data.explicacao ?? '') }
    },
    async findSources(questionId) {
      const { data: sourceRows, error: sourceError } = await admin.from('questao_fontes').select('document_id,pagina').eq('questao_id', questionId)
      if (sourceError) throw sourceError
      const documentIds = [...new Set((sourceRows ?? []).map((source) => Number(source.document_id)))]
      if (documentIds.length === 0) return []
      const { data: documents, error: documentsError } = await admin.from('documents').select('id,material_id').in('id', documentIds)
      if (documentsError) throw documentsError
      const materialIds = [...new Set((documents ?? []).map((document) => Number(document.material_id)))]
      const { data: materials, error: materialsError } = await admin.from('materiais_concurso').select('id,titulo').in('id', materialIds)
      if (materialsError) throw materialsError
      const materialByDocument = new Map((documents ?? []).map((document) => [Number(document.id), Number(document.material_id)]))
      const titleByMaterial = new Map((materials ?? []).map((material) => [Number(material.id), String(material.titulo)]))
      return (sourceRows ?? []).map((source) => ({
        titulo: titleByMaterial.get(materialByDocument.get(Number(source.document_id)) ?? -1) ?? 'Material de estudo',
        pagina: typeof source.pagina === 'number' ? source.pagina : null,
      }))
    },
    async persist(_userId, answerInput) {
      const { data, error } = await supabase.rpc('responder_questao', {
        p_questao_id: answerInput.questao_id,
        p_alternativa: answerInput.alternativa_selecionada,
        p_tempo_gasto: answerInput.tempo_gasto ?? null,
      })
      if (error) throw error
      return parseRpcAnswer(data)
    },
  })
  return submit(input)
}
