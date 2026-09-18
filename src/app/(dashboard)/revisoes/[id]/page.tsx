'use client'

import { useParams, useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, XCircle } from 'lucide-react'
import { useReviewSession } from '@/hooks/useRevisoes'
import { cn } from '@/lib/utils'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function SessaoRevisaoPage() {
  const params = useParams<{ id: string }>(); const router = useRouter(); const { session, current, index, selected, result, loading, answering, error, select, answer, previous, next, complete } = useReviewSession(params.id)
  const advance = async () => { if (session && index + 1 >= session.questions.length) { if (await complete()) router.push('/revisoes') } else next() }
  if (loading) return <Card><CardContent className="space-y-4 p-6"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-28" />{[1,2,3,4,5].map((item) => <Skeleton key={item} className="h-14" />)}</CardContent></Card>
  if (error && !session) return <Alert variant="destructive"><p>{error}</p></Alert>
  if (!session || !current) return <Alert><p>Sessão de revisão vazia.</p></Alert>
  return <div className="space-y-5 fade-in"><div><h1 className="text-2xl font-bold">{session.titulo}</h1><p className="text-muted-foreground">Questão {index + 1} de {session.questions.length}</p></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${((index + 1) / session.questions.length) * 100}%` }} /></div>{error && <Alert variant="destructive"><div className="flex gap-2"><AlertCircle className="h-5 w-5" /><p>{error}</p></div></Alert>}
    <Card><CardHeader><p className="text-sm text-muted-foreground">{[current.disciplina, current.assunto, current.subassunto].filter(Boolean).join(' • ')}</p><CardTitle className="whitespace-pre-wrap text-lg leading-relaxed">{current.enunciado}</CardTitle></CardHeader><CardContent className="space-y-5"><fieldset className="space-y-3" disabled={Boolean(result) || answering}>{current.alternativas.map((option) => { const correct = result?.alternativaCorreta === option.letra; const wrong = Boolean(result && selected === option.letra && !result.correta); return <button type="button" key={option.letra} onClick={() => select(option.letra)} className={cn('flex w-full gap-3 rounded-lg border p-4 text-left', selected === option.letra && !result && 'border-primary ring-1 ring-primary', correct && 'border-green-600 bg-green-50', wrong && 'border-red-600 bg-red-50')}><span className="font-bold">{option.letra}</span><span>{option.texto}</span></button> })}</fieldset>
      {!result && <Button onClick={() => void answer()} disabled={!selected || answering}>{answering ? <Loader2 className="animate-spin" /> : null}Responder</Button>}{result && <Alert className={result.correta ? 'border-green-600' : 'border-red-600'}><div className="flex gap-2">{result.correta ? <CheckCircle2 className="text-green-600" /> : <XCircle className="text-red-600" />}<div className="space-y-3"><p className="font-semibold">{result.correta ? 'Resposta correta!' : `Resposta incorreta. Gabarito: ${result.alternativaCorreta}`}</p><p className="text-sm">{result.explicacao || 'Esta questão ainda não possui explicação cadastrada.'}</p><Button size="sm" onClick={() => router.push(`/questoes/${current.id}/estudar`)}>Estudar esta questão</Button></div></div></Alert>}
      <div className="flex justify-between border-t pt-4"><Button variant="outline" onClick={previous} disabled={index === 0}><ChevronLeft />Anterior</Button><Button onClick={() => void advance()} disabled={!result}>{index + 1 >= session.questions.length ? 'Concluir revisão' : 'Próxima'}<ChevronRight /></Button></div>
    </CardContent></Card>
  </div>
}
