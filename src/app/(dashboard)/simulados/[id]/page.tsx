'use client'

import { useParams, useRouter } from 'next/navigation'
import { AlertCircle, ChevronLeft, ChevronRight, Clock3, Loader2 } from 'lucide-react'
import { useSimulado } from '@/hooks/useSimulados'
import { cn } from '@/lib/utils'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

function formatTime(seconds: number) { const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); const rest = seconds % 60; return [hours, minutes, rest].map((value) => String(value).padStart(2, '0')).join(':') }

export default function ExecutarSimuladoPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { session, current, index, seconds, answeredCount, loading, saving, finishing, error, selectAnswer, previous, next, goTo, finish } = useSimulado(params.id)
  const finishSimulation = async () => { if (!window.confirm(`Finalizar agora? ${Math.max(0, (session?.questions.length ?? 0) - answeredCount)} questão(ões) ficarão sem resposta.`)) return; if (await finish()) router.push(`/simulados/${params.id}/resultado`) }

  if (loading) return <Card><CardHeader><Skeleton className="h-6 w-1/3" /></CardHeader><CardContent className="space-y-4"><Skeleton className="h-28" />{[1,2,3,4,5].map((item) => <Skeleton key={item} className="h-16" />)}</CardContent></Card>
  if (error && !session) return <Alert variant="destructive"><div className="flex gap-2"><AlertCircle className="h-5 w-5" /><p>{error}</p></div></Alert>
  if (session?.status === 'concluido') return <Card><CardContent className="space-y-4 py-10 text-center"><p className="font-semibold">Este simulado já foi concluído.</p><Button onClick={() => router.push(`/simulados/${params.id}/resultado`)}>Ver resultado</Button></CardContent></Card>
  if (!session || !current) return <Alert><p>Este simulado não possui questões disponíveis.</p></Alert>

  const selected = session.answers[current.id]
  return <div className="space-y-5 fade-in">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Simulado</h1><p className="text-sm text-muted-foreground">{session.assunto || session.disciplina || 'Todas as disciplinas'}</p></div>{session.cronometro && <div className="flex items-center gap-2 rounded-lg border px-4 py-2 font-mono"><Clock3 className="h-4 w-4" />{formatTime(seconds)}</div>}</div>
    <div className="space-y-2"><div className="flex justify-between text-sm"><span>Questão {index + 1} de {session.questions.length}</span><span>{answeredCount} respondidas</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${((index + 1) / session.questions.length) * 100}%` }} /></div></div>
    <div className="flex flex-wrap gap-2" aria-label="Navegação entre questões">{session.questions.map((question, questionIndex) => <button key={question.id} onClick={() => goTo(questionIndex)} className={cn('h-9 w-9 rounded-md border text-sm', questionIndex === index && 'border-primary ring-2 ring-primary', session.answers[question.id] && 'bg-primary text-primary-foreground')}>{questionIndex + 1}</button>)}</div>
    {error && <Alert variant="destructive"><div className="flex gap-2"><AlertCircle className="h-5 w-5" /><p>{error}</p></div></Alert>}
    <Card><CardHeader><p className="text-sm text-muted-foreground">{[current.disciplina, current.assunto, current.subassunto].filter(Boolean).join(' • ')}</p><CardTitle className="whitespace-pre-wrap text-lg leading-relaxed">{current.enunciado}</CardTitle></CardHeader><CardContent className="space-y-5">
      <fieldset className="space-y-3" disabled={saving}>{current.alternativas.map((option) => <button type="button" key={option.letra} onClick={() => void selectAnswer(option.letra)} className={cn('flex w-full gap-3 rounded-lg border p-4 text-left hover:bg-muted/50', selected === option.letra && 'border-primary bg-primary/5 ring-1 ring-primary')}><span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-semibold', selected === option.letra && 'bg-primary text-primary-foreground')}>{option.letra}</span><span className="pt-0.5 text-sm leading-relaxed">{option.texto}</span>{saving && selected === option.letra && <Loader2 className="ml-auto animate-spin" />}</button>)}</fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5"><Button variant="outline" onClick={previous} disabled={index === 0}><ChevronLeft />Anterior</Button><Button variant="destructive" onClick={() => void finishSimulation()} disabled={finishing}>{finishing ? <Loader2 className="animate-spin" /> : null}Finalizar</Button><Button onClick={next} disabled={index + 1 >= session.questions.length}>Próxima<ChevronRight /></Button></div>
    </CardContent></Card>
  </div>
}
