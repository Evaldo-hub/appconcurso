'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Clock3, FilePlus2, Loader2, RotateCcw, Target, XCircle } from 'lucide-react'
import { useSimuladoResult } from '@/hooks/useSimulados'
import { simuladosService } from '@/services/simulados.service'
import { cn } from '@/lib/utils'
import { MetricCard } from '@/components/dashboard/metric-card'
import { SimpleChart } from '@/components/dashboard/simple-chart'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

function formatTime(seconds: number | null) { if (!seconds) return '0 min'; const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); return hours ? `${hours}h ${minutes}min` : `${Math.max(1, minutes)} min` }

export default function ResultadoSimuladoPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { result, loading, error } = useSimuladoResult(params.id)
  const [reviewErrors, setReviewErrors] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  if (loading) return <div className="space-y-5"><Skeleton className="h-10 w-1/3" /><div className="grid gap-4 md:grid-cols-4">{[1,2,3,4].map((item) => <Skeleton key={item} className="h-28" />)}</div><Skeleton className="h-80" /></div>
  if (error || !result) return <Alert variant="destructive"><div className="flex gap-2"><AlertCircle className="h-5 w-5" /><p>{error || 'Resultado não encontrado.'}</p></div></Alert>

  const { summary, questions } = result
  const unanswered = Math.max(0, summary.quantidade - summary.respondidas)
  const percentage = summary.quantidade ? Math.round((summary.acertos / summary.quantidade) * 1000) / 10 : 0
  const visibleQuestions = reviewErrors ? questions.filter((question) => !question.correta) : []
  const retry = async () => { setRetrying(true); setActionError(null); try { const id = await simuladosService.retryErrors(params.id); router.push(`/simulados/${id}`) } catch (retryError) { setActionError(retryError instanceof Error ? retryError.message : 'Não foi possível refazer as questões.') } finally { setRetrying(false) } }
  const hardestSubject = [...result.bySubject].sort((a, b) => a.percentual - b.percentual)[0]

  return <div className="space-y-6 fade-in">
    <div><p className="text-sm text-muted-foreground">Resultado do simulado</p><h1 className="text-2xl font-bold md:text-3xl">{summary.assunto || summary.disciplina || 'Todas as disciplinas'}</h1></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><MetricCard title="Nota" value={`${percentage}%`} icon={Target} /><MetricCard title="Acertos" value={summary.acertos} icon={CheckCircle2} /><MetricCard title="Erros" value={summary.erros} icon={XCircle} /><MetricCard title="Não respondidas" value={unanswered} icon={AlertCircle} /><MetricCard title="Tempo" value={formatTime(summary.tempoTotal)} icon={Clock3} /></div>
    {actionError && <Alert variant="destructive"><p>{actionError}</p></Alert>}
    <div className="flex flex-wrap gap-2"><Button onClick={() => setReviewErrors((value) => !value)}><RotateCcw />{reviewErrors ? 'Ocultar revisão' : 'Revisar erros'}</Button><Button variant="outline" onClick={() => void retry()} disabled={retrying || summary.erros === 0}>{retrying ? <Loader2 className="animate-spin" /> : <RotateCcw />}Refazer erradas</Button>{hardestSubject && <Button variant="outline" onClick={() => router.push(`/estudar?assunto=${encodeURIComponent(hardestSubject.label)}`)}>Estudar maior dificuldade</Button>}<Button variant="outline" onClick={() => router.push('/simulados')}><FilePlus2 />Novo simulado</Button></div>
    <div className="grid gap-6 xl:grid-cols-3"><SimpleChart title="Por disciplina (%)" data={result.byDiscipline.map((item) => ({ label: item.label, value: item.percentual }))} /><SimpleChart title="Por assunto (%)" data={result.bySubject.map((item) => ({ label: item.label, value: item.percentual }))} /><SimpleChart title="Por dificuldade (%)" data={result.byDifficulty.map((item) => ({ label: item.label, value: item.percentual }))} /></div>

    {reviewErrors && <section className="space-y-4"><h2 className="text-xl font-semibold">Revisão de erros e não respondidas</h2>{visibleQuestions.length === 0 ? <Alert><p>Parabéns! Não há questões para revisar.</p></Alert> : visibleQuestions.map((question) => <Card key={question.id}><CardHeader><p className="text-sm text-muted-foreground">Questão {question.ordem} • {[question.disciplina, question.assunto].filter(Boolean).join(' • ')}</p><CardTitle className="whitespace-pre-wrap text-base leading-relaxed">{question.enunciado}</CardTitle></CardHeader><CardContent className="space-y-4"><div className="space-y-2">{question.alternativas.map((option) => { const correct = option.letra === question.alternativaCorreta; const selectedWrong = option.letra === question.alternativaSelecionada && !question.correta; return <div key={option.letra} className={cn('flex gap-3 rounded-lg border p-3 text-sm', correct && 'border-green-600 bg-green-50 dark:bg-green-950/30', selectedWrong && 'border-red-600 bg-red-50 dark:bg-red-950/30')}><span className="font-bold">{option.letra}</span><span>{option.texto}</span></div> })}</div><p className="text-sm font-medium">Sua resposta: {question.alternativaSelecionada || 'Não respondida'} • Gabarito: {question.alternativaCorreta}</p><div className="rounded-lg bg-muted p-4 text-sm"><p className="font-semibold">Explicação</p><p className="mt-1 whitespace-pre-wrap leading-relaxed">{question.explicacao || 'Esta questão ainda não possui explicação cadastrada.'}</p></div><Button size="sm" onClick={() => router.push(`/questoes/${question.id}/estudar`)}>Estudar esta questão</Button></CardContent></Card>)}</section>}
  </div>
}
