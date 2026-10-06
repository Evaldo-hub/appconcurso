'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Layers3, Loader2 } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { RagSelectionCatalog } from '@/lib/study/rag-selection-catalog'
import { listarAssuntosDaProva, listarDisciplinasDaProva, listarSubassuntosDaProva } from '@/lib/contest-catalog/selection'
import { canSubmitStudySelection, initialRagStudySelection, selectContest, selectDiscipline, selectExam, selectSubject } from '@/lib/study/rag-selection-state'
import { generateStudyQuestionAction, submitStudyAnswerAction } from '@/app/(dashboard)/questoes/gerar/actions'
import type { SafeStudyQuestion, StudyFlowErrorCode, StudyQuestionBatchResult } from '@/lib/study/generate-study-question'
import type { AnswerLetter } from '@/lib/study/submit-study-answer'
import { beginStudyAnswer, confirmStudyAnswer, emptyStudyAnswerState, failStudyAnswer, selectStudyAnswer, summarizeStudyAnswers, type StudyAnswerState } from '@/lib/study/study-answer-state'
import { StudyQuestionAnswerCard } from './study-question-answer-card'

interface Option { value: string; label: string }

export function RagStudySelection({ catalog, error }: { catalog: RagSelectionCatalog; error: string | null }) {
  const [selection, setSelection] = useState(initialRagStudySelection)
  const [pending, setPending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [batch, setBatch] = useState<StudyQuestionBatchResult | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<number, StudyAnswerState>>({})
  const exams = useMemo(() => catalog.exams.filter((exam) => String(exam.contestId) === selection.contestId), [catalog.exams, selection.contestId])
  const selectedExamId = Number(selection.examId)
  const disciplines = Number.isSafeInteger(selectedExamId) ? listarDisciplinasDaProva(catalog, selectedExamId) : []
  const subjects = Number.isSafeInteger(selectedExamId) && selection.discipline ? listarAssuntosDaProva(catalog, selectedExamId, selection.discipline) : []
  const subsubjects = Number.isSafeInteger(selectedExamId) && selection.discipline && selection.subject
    ? listarSubassuntosDaProva(catalog, selectedExamId, selection.discipline, selection.subject) : []
  const canSubmit = canSubmitStudySelection(selection, pending) && !error

  const generateQuestion = async () => {
    if (!canSubmit) return
    setPending(true); setErrorMessage(null); setBatch(null); setCurrentIndex(0); setAnswers({})
    try {
      const result = await generateStudyQuestionAction({
        concurso_id: selection.contestId, prova_id: selection.examId, disciplina: selection.discipline,
        assunto: selection.subject, subassunto: selection.subsubject, quantidade: selection.amount,
      })
      if (!result.ok) { setErrorMessage(errorMessages[result.code]); return }
      setBatch(result.batch)
    } catch { setErrorMessage(errorMessages.GENERATION_FAILED) }
    finally { setPending(false) }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
          <Bot className="h-8 w-8 text-primary" />
          Gerar questões com IA
        </h1>
        <p className="text-muted-foreground">Selecione o conteúdo que deseja estudar.</p>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Layers3 className="h-5 w-5" />Seleção do conteúdo</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <SelectionField id="rag-contest" label="Concurso" value={selection.contestId} onChange={(value) => { setSelection((current) => selectContest(current, value)); setBatch(null) }} options={catalog.contests.map((item) => ({ value: String(item.id), label: `${item.name}${item.year ? ` — ${item.year}` : ''}` }))} placeholder={catalog.contests.length ? 'Selecione o concurso' : 'Nenhum concurso disponível'} disabled={Boolean(error) || catalog.contests.length === 0 || pending} />
            <SelectionField id="rag-exam" label="Prova" value={selection.examId} onChange={(value) => { setSelection((current) => selectExam(current, value)); setBatch(null) }} options={exams.map((item) => ({ value: String(item.id), label: [item.code, item.role, item.specialty].filter(Boolean).join(' — ') }))} placeholder={!selection.contestId ? 'Selecione primeiro o concurso' : exams.length ? 'Selecione a prova' : 'Nenhuma prova disponível'} disabled={!selection.contestId || exams.length === 0 || pending} />
            <SelectionField id="rag-discipline" label="Disciplina" value={selection.discipline} onChange={(value) => { setSelection((current) => selectDiscipline(current, value)); setBatch(null) }} options={disciplines.map(toOption)} placeholder={!selection.examId ? 'Selecione primeiro a prova' : disciplines.length ? 'Selecione a disciplina' : 'Nenhuma disciplina disponível'} disabled={!selection.examId || disciplines.length === 0 || pending} />
            <SelectionField id="rag-subject" label="Assunto" value={selection.subject} onChange={(value) => { setSelection((current) => selectSubject(current, value)); setBatch(null) }} options={subjects.map(toOption)} placeholder={!selection.discipline ? 'Selecione primeiro a disciplina' : subjects.length ? 'Selecione o assunto' : 'Nenhum assunto disponível'} disabled={!selection.discipline || subjects.length === 0 || pending} />
            <SelectionField id="rag-subsubject" label="Subassunto" value={selection.subsubject} onChange={(value) => setSelection((current) => ({ ...current, subsubject: value }))} options={subsubjects.map(toOption)} placeholder={!selection.subject ? 'Selecione primeiro o assunto' : subsubjects.length ? 'Todos os subassuntos' : 'Sem subassunto específico'} disabled={!selection.subject || subsubjects.length === 0} />
            <SelectionField id="rag-amount" label="Quantidade de questões" value={String(selection.amount)} onChange={(value) => setSelection((current) => ({ ...current, amount: Number(value) as 1 | 5 | 10 }))} options={[1, 5, 10].map((amount) => ({ value: String(amount), label: String(amount) }))} placeholder="Selecione" />
          </div>
          <div className="flex flex-col items-start gap-2">
            <Button type="button" disabled={!canSubmit} onClick={() => void generateQuestion()}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}{pending ? `Gerando ${selection.amount} ${selection.amount === 1 ? 'questão' : 'questões'}...` : 'Gerar questões'}</Button>
          </div>
        </CardContent>
      </Card>
      {errorMessage && <Alert variant="destructive">{errorMessage}</Alert>}
      {batch && <BatchQuestions batch={batch} currentIndex={currentIndex} setCurrentIndex={setCurrentIndex} answers={answers} setAnswers={setAnswers} />}
    </div>
  )
}

function SelectionField({ id, label, value, onChange, options, placeholder, disabled = false }: { id: string; label: string; value: string; onChange: (value: string) => void; options: Option[]; placeholder: string; disabled?: boolean }) {
  return <div className="space-y-2"><label htmlFor={id} className="text-sm font-medium">{label}</label><select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"><option value="">{placeholder}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
}

function toOption(value: string): Option { return { value, label: value } }

const errorMessages: Record<StudyFlowErrorCode, string> = {
  AUTH_REQUIRED: 'Sua sessão expirou. Entre novamente.', INVALID_RAG_SELECTION: 'A seleção escolhida não está disponível para geração.', INVALID_QUANTITY: 'Selecione uma quantidade válida de questões.',
  NO_RAG_CONTEXT: 'Não encontramos conteúdo suficiente para gerar esta questão.', GENERATION_FAILED: 'Não foi possível gerar a questão agora. Tente novamente.',
  SEMANTIC_REJECTED: 'A questão gerada não atingiu os critérios de validação. Tente novamente.', PERSISTENCE_FAILED: 'A questão foi validada, mas não pôde ser salva.',
}

function BatchQuestions({ batch, currentIndex, setCurrentIndex, answers, setAnswers }: { batch: StudyQuestionBatchResult; currentIndex: number; setCurrentIndex: (value: number) => void; answers: Record<number, StudyAnswerState>; setAnswers: React.Dispatch<React.SetStateAction<Record<number, StudyAnswerState>>> }) {
  const visibleSince = useRef<Record<number, number>>({})
  const currentQuestionId = batch.questions[currentIndex]?.questao_id
  useEffect(() => {
    if (currentQuestionId && visibleSince.current[currentQuestionId] === undefined) visibleSince.current[currentQuestionId] = Date.now()
  }, [currentQuestionId])
  if (batch.questions.length === 0) return <Alert variant="destructive">{batch.stoppedReason === 'AI_PROVIDER_UNAVAILABLE'
    ? 'Os serviços de IA estão temporariamente indisponíveis. O conteúdo RAG foi encontrado, mas não foi possível gerar a questão agora.'
    : 'Não foi possível concluir nenhuma questão neste lote.'}</Alert>
  const question = batch.questions[currentIndex]
  const state = answers[question.questao_id] ?? emptyStudyAnswerState()
  const summary = summarizeStudyAnswers(batch.questions.map((item) => item.questao_id), answers)

  const submitAnswer = async () => {
    if (!state.selected || state.pending || state.confirmed) return
    setAnswers((current) => ({ ...current, [question.questao_id]: beginStudyAnswer(state) }))
    try {
      const startedAt = visibleSince.current[question.questao_id] ?? Date.now()
      const result = await submitStudyAnswerAction({ questao_id: question.questao_id, alternativa_selecionada: state.selected, tempo_gasto: Math.min(86_400, Math.max(0, Math.floor((Date.now() - startedAt) / 1_000))) })
      if (!result.ok) {
        setAnswers((current) => ({ ...current, [question.questao_id]: failStudyAnswer(state, answerErrorMessages[result.code]) }))
        return
      }
      setAnswers((current) => ({ ...current, [question.questao_id]: confirmStudyAnswer(state, result.answer) }))
    } catch {
      setAnswers((current) => ({ ...current, [question.questao_id]: failStudyAnswer(state, answerPersistenceMessage) }))
    }
  }

  return <div className="space-y-4">{batch.status !== 'complete' && <Alert>O lote terminou parcialmente: {batch.generatedCount} de {batch.requestedQuantity} questões disponíveis.</Alert>}<div className="flex items-center justify-between gap-3"><Button variant="outline" disabled={currentIndex === 0} onClick={() => setCurrentIndex(currentIndex - 1)}>Anterior</Button><span className="text-sm font-medium">Questão {currentIndex + 1} de {batch.questions.length}</span><Button variant="outline" disabled={currentIndex === batch.questions.length - 1} onClick={() => setCurrentIndex(currentIndex + 1)}>Próxima</Button></div><GeneratedQuestionCard question={question} state={state} onSelect={(selected) => setAnswers((current) => ({ ...current, [question.questao_id]: selectStudyAnswer(selected) }))} onAnswer={() => void submitAnswer()} /><Card><CardContent className="grid grid-cols-4 gap-2 py-4 text-center text-sm"><div><strong className="block text-xl">{summary.answered}</strong>Respondidas</div><div><strong className="block text-xl">{summary.correct}</strong>Corretas</div><div><strong className="block text-xl">{summary.incorrect}</strong>Incorretas</div><div><strong className="block text-xl">{summary.pending}</strong>Pendentes</div></CardContent></Card></div>
}

const answerPersistenceMessage = 'Não foi possível registrar sua resposta. Tente novamente.'
const answerErrorMessages = { AUTH_REQUIRED: 'Sua sessão expirou. Entre novamente.', INVALID_ANSWER_INPUT: answerPersistenceMessage, QUESTION_NOT_FOUND: 'Esta questão não está mais disponível.', ANSWER_PERSISTENCE_FAILED: answerPersistenceMessage }

function GeneratedQuestionCard({ question, state, onSelect, onAnswer }: { question: SafeStudyQuestion; state: StudyAnswerState; onSelect: (answer: AnswerLetter) => void; onAnswer: () => void }) {
  return <StudyQuestionAnswerCard question={{ id: question.questao_id, disciplina: question.disciplina, assunto: question.assunto, subassunto: question.subassunto, banca: question.banca, dificuldade: question.dificuldade, enunciado: question.enunciado, alternativas: question.alternativas }} state={state} onSelect={onSelect} onAnswer={onAnswer} duplicate={question.status === 'duplicate'} />
}
