'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AlertCircle, BookOpen, Bot, ChevronLeft, FileText, GraduationCap, Library, Loader2, Send, Sparkles } from 'lucide-react'
import { useEstudoQuestao } from '@/hooks/useEstudoQuestao'
import type { StudyMode } from '@/services/estudo.service'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const modes: Array<{ value: StudyMode; label: string; icon: typeof BookOpen }> = [
  { value: 'explicacao', label: 'Explicação rápida', icon: Sparkles }, { value: 'resumo', label: 'Resumo', icon: FileText },
  { value: 'aula', label: 'Aula completa', icon: GraduationCap }, { value: 'perguntar', label: 'Perguntar à IA', icon: Bot },
]

export default function EstudarQuestaoPage() {
  const params = useParams<{ id: string }>(); const router = useRouter(); const { data, mode, setMode, loading, generating, error, generationError, messages, generate, ask } = useEstudoQuestao(params.id); const [showSources, setShowSources] = useState(false); const [question, setQuestion] = useState('')
  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-1/3" /><Skeleton className="h-24" /><Skeleton className="h-80" /></div>
  if (error || !data) return <Alert variant="destructive"><div className="flex gap-2"><AlertCircle className="h-5 w-5" /><p>{error || 'Conteúdo não encontrado.'}</p></div></Alert>
  const content = mode === 'perguntar' ? null : data.conteudos[mode]
  const submitQuestion = async () => { const value = question.trim(); if (!value) return; if (await ask(value)) setQuestion('') }

  return <div className="space-y-6 fade-in"><Button variant="ghost" onClick={() => router.back()}><ChevronLeft />Voltar à questão</Button><div><p className="text-sm text-muted-foreground">{[data.questao.disciplina, data.questao.assunto, data.questao.subassunto].filter(Boolean).join(' • ')}</p><h1 className="text-2xl font-bold md:text-3xl">Estudar esta questão</h1></div>
    <Card><CardContent className="p-5"><p className="whitespace-pre-wrap text-sm leading-relaxed">{data.questao.enunciado}</p></CardContent></Card>
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{modes.map(({ value, label, icon: Icon }) => <button key={value} onClick={() => setMode(value)} className={`flex items-center gap-3 rounded-lg border p-4 text-left ${mode === value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card hover:bg-muted/50'}`}><Icon className="h-5 w-5" /><span className="font-medium">{label}</span></button>)}</div>
    {generationError && <Alert variant="destructive"><div className="flex gap-2"><AlertCircle className="h-5 w-5" /><p>{generationError}</p></div></Alert>}
    <Card><CardHeader><CardTitle>{modes.find((item) => item.value === mode)?.label}</CardTitle></CardHeader><CardContent>
      {mode === 'perguntar' ? <div className="space-y-5">
        {messages.length === 0 && <div className="py-6 text-center"><Bot className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><p className="font-medium">Converse sobre esta questão</p><p className="text-sm text-muted-foreground">As respostas utilizam apenas o contexto e as fontes vinculadas à questão.</p></div>}
        {messages.map((message, index) => <div key={index} className="space-y-2"><div className="ml-auto max-w-[85%] rounded-lg bg-primary p-3 text-sm text-primary-foreground">{message.pergunta}</div><div className="max-w-[90%] whitespace-pre-wrap rounded-lg bg-muted p-4 text-sm leading-relaxed">{message.resposta}</div></div>)}
        <div className="flex flex-col gap-2 sm:flex-row"><textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} rows={3} placeholder="Digite sua dúvida sobre a questão..." className="min-h-20 flex-1 resize-y rounded-md border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" /><Button onClick={() => void submitQuestion()} disabled={generating || !question.trim()}>{generating ? <Loader2 className="animate-spin" /> : <Send />}Enviar</Button></div>
      </div>
      : content ? <div className="whitespace-pre-wrap text-sm leading-relaxed">{content}</div>
      : <div className="space-y-3 py-10 text-center"><Library className="mx-auto h-10 w-10 text-muted-foreground" /><p className="font-medium">Conteúdo ainda não disponível no cache</p><p className="text-sm text-muted-foreground">Solicite a geração segura com base nas fontes relacionadas à questão.</p><Button onClick={() => void generate(mode)} disabled={generating}>{generating ? <Loader2 className="animate-spin" /> : <Sparkles />}{generating ? `Gerando ${modes.find((item) => item.value === mode)?.label.toLowerCase()}...` : `Gerar ${modes.find((item) => item.value === mode)?.label.toLowerCase()}`}</Button></div>}
    </CardContent></Card>
    {data.fontes.length > 0 && <Card><CardHeader><button onClick={() => setShowSources((value) => !value)} className="flex items-center gap-2 text-left"><Library className="h-5 w-5" /><div><CardTitle>Baseado em material de estudo</CardTitle><p className="mt-1 text-sm text-muted-foreground">{showSources ? 'Ocultar fontes' : 'Ver fontes'}</p></div></button></CardHeader>{showSources && <CardContent className="space-y-2">{data.fontes.map((source) => <div key={source.id} className="rounded-lg border p-3 text-sm"><p className="font-medium">{source.arquivo}</p>{source.pagina && <p className="text-muted-foreground">Página {source.pagina}</p>}</div>)}</CardContent>}</Card>}
  </div>
}
