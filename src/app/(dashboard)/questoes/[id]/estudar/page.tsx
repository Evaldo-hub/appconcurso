'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  AlertCircle,
  BookOpen,
  Bot,
  ChevronLeft,
  FileText,
  GraduationCap,
  Library,
  Lightbulb,
  Loader2,
  Network,
  Send,
  Sparkles,
} from 'lucide-react'
import { useEstudoQuestao } from '@/hooks/useEstudoQuestao'
import type { StudyMode } from '@/services/estudo.service'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StudyMarkdown } from '@/components/estudar/study-markdown'
import { cn } from '@/lib/utils'

const modes: Array<{ value: StudyMode; label: string; description: string; icon: typeof BookOpen }> = [
  { value: 'explicacao', label: 'Explicação rápida', description: 'Entenda rapidamente por que a resposta está correta.', icon: Lightbulb },
  { value: 'resumo', label: 'Resumo', description: 'Revisão objetiva do conteúdo cobrado nesta questão.', icon: FileText },
  { value: 'aula', label: 'Aula completa', description: 'Estudo aprofundado do assunto da questão.', icon: GraduationCap },
  { value: 'mapa_mental', label: 'Mapa mental', description: 'Visualize os conceitos e relações essenciais do tema.', icon: Network },
  { value: 'perguntar', label: 'Perguntar à IA', description: 'Tire dúvidas específicas sobre esta questão.', icon: Bot },
]

const questionExamples = [
  'Por que a alternativa B está correta?',
  'Qual conceito preciso memorizar?',
  'Explique esse assunto de forma mais simples.',
  'Qual é a pegadinha desta questão?',
]

const generatingLabel: Record<Exclude<StudyMode, 'perguntar'>, string> = {
  explicacao: 'Gerando explicação...',
  resumo: 'Gerando resumo...',
  aula: 'Preparando aula completa...',
  mapa_mental: 'Criando mapa mental...',
}

export default function EstudarQuestaoPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { data, mode, setMode, loading, generating, error, generationError, messages, generate, ask } = useEstudoQuestao(params.id)
  const [showSources, setShowSources] = useState(false)
  const [question, setQuestion] = useState('')

  if (loading) return <StudyPageSkeleton />
  if (error || !data) return <Alert variant="destructive"><div className="flex gap-2"><AlertCircle className="h-5 w-5 shrink-0" /><p>{error || 'Conteúdo não encontrado.'}</p></div></Alert>

  const activeMode = modes.find((item) => item.value === mode) ?? modes[0]
  const content = mode === 'perguntar' ? null : data.conteudos[mode]
  const context = [data.questao.disciplina, data.questao.assunto, data.questao.subassunto].filter(Boolean).join(' • ')

  const submitQuestion = async () => {
    const value = question.trim()
    if (!value || generating) return
    if (await ask(value)) setQuestion('')
  }

  const retry = () => {
    if (generating) return
    if (mode === 'perguntar') void submitQuestion()
    else void generate(mode)
  }

  return <div className="mx-auto max-w-6xl space-y-6 pb-10 fade-in">
    <Button variant="ghost" onClick={() => router.back()} className="-ml-3"><ChevronLeft />Voltar à questão</Button>

    <header className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">{context}</p>
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Estudar esta questão</h1>
    </header>

    <Card className="shadow-sm">
      <CardContent className="p-5 sm:p-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Enunciado</p>
        <p className="whitespace-pre-wrap text-[0.975rem] leading-7 sm:text-base">{data.questao.enunciado}</p>
      </CardContent>
    </Card>

    <nav aria-label="Modos de estudo">
      <div role="tablist" className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        {modes.map(({ value, label, icon: Icon }) => <button
          key={value}
          id={`study-tab-${value}`}
          type="button"
          role="tab"
          aria-selected={mode === value}
          aria-controls="study-panel"
          onClick={() => setMode(value)}
          className={cn(
            'flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            mode === value ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        ><Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{label}</span></button>)}
      </div>
    </nav>

    <Card id="study-panel" role="tabpanel" aria-labelledby={`study-tab-${mode}`} className="overflow-hidden shadow-sm">
      <CardHeader className="border-b bg-muted/20 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg border bg-background p-2"><activeMode.icon className="h-5 w-5" aria-hidden="true" /></div>
          <div className="space-y-1">
            <CardTitle className="text-xl">{activeMode.label}</CardTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">{activeMode.description}</p>
            <p className="pt-1 text-xs font-medium text-muted-foreground">{[data.questao.disciplina, data.questao.assunto].filter(Boolean).join(' • ')}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 sm:p-6 lg:p-8">
        {generationError && <GenerationError onRetry={retry} retryDisabled={generating || (mode === 'perguntar' && !question.trim())} />}

        {mode === 'perguntar'
          ? <AskAssistant question={question} setQuestion={setQuestion} messages={messages} generating={generating} submitQuestion={submitQuestion} />
          : content
            ? <StudyMarkdown content={content} mode={mode} />
            : <EmptyContent mode={mode} generating={generating} onGenerate={() => void generate(mode)} />}
      </CardContent>
    </Card>

    {data.fontes.length > 0 && <Card className="shadow-sm">
      <CardHeader className="p-0">
        <button type="button" onClick={() => setShowSources((value) => !value)} aria-expanded={showSources} className="flex w-full items-center gap-3 rounded-xl p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:p-6">
          <Library className="h-5 w-5 shrink-0" aria-hidden="true" />
          <div><CardTitle>Materiais relacionados</CardTitle><p className="mt-1 text-sm text-muted-foreground">{showSources ? 'Ocultar materiais' : 'Consultar materiais usados neste estudo'}</p></div>
        </button>
      </CardHeader>
      {showSources && <CardContent className="space-y-2 border-t p-5 sm:p-6">{data.fontes.map((source) => <div key={source.id} className="rounded-lg border bg-muted/20 p-3 text-sm"><p className="font-medium">{source.arquivo}</p>{source.pagina && <p className="mt-1 text-muted-foreground">Página {source.pagina}</p>}</div>)}</CardContent>}
    </Card>}
  </div>
}

function StudyPageSkeleton() {
  return <div className="mx-auto max-w-6xl space-y-6" aria-label="Carregando área de estudo">
    <Skeleton className="h-9 w-40" />
    <div className="space-y-2"><Skeleton className="h-4 w-64" /><Skeleton className="h-9 w-72" /></div>
    <Skeleton className="h-36 w-full" />
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
    <Skeleton className="h-80 w-full" />
  </div>
}

function GenerationError({ onRetry, retryDisabled }: { onRetry: () => void; retryDisabled: boolean }) {
  return <Alert variant="destructive" className="mb-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-2"><AlertCircle className="h-5 w-5 shrink-0" /><div><p className="font-medium">Não foi possível gerar o conteúdo.</p><p className="mt-1 text-sm opacity-90">Tente novamente em alguns instantes.</p></div></div>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={retryDisabled}>Tentar novamente</Button>
    </div>
  </Alert>
}

function EmptyContent({ mode, generating, onGenerate }: { mode: Exclude<StudyMode, 'perguntar'>; generating: boolean; onGenerate: () => void }) {
  const label = modes.find((item) => item.value === mode)?.label.toLowerCase() ?? 'conteúdo'
  return <div className="flex min-h-64 flex-col items-center justify-center space-y-4 text-center">
    <div className="rounded-full bg-muted p-4">{generating ? <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" /> : <Sparkles className="h-7 w-7 text-muted-foreground" aria-hidden="true" />}</div>
    <div className="space-y-1"><p className="font-semibold">{generating ? generatingLabel[mode] : 'Este conteúdo ainda não foi gerado.'}</p><p className="text-sm text-muted-foreground">{generating ? 'Você pode continuar nesta página enquanto preparamos o material.' : 'Gere um material de estudo focado no conteúdo desta questão.'}</p></div>
    <Button type="button" onClick={onGenerate} disabled={generating}>{generating ? <Loader2 className="animate-spin" /> : <Sparkles />}{generating ? generatingLabel[mode] : `Gerar ${label}`}</Button>
  </div>
}

interface AskAssistantProps {
  question: string
  setQuestion: (value: string) => void
  messages: Array<{ pergunta: string; resposta: string }>
  generating: boolean
  submitQuestion: () => Promise<void>
}

function AskAssistant({ question, setQuestion, messages, generating, submitQuestion }: AskAssistantProps) {
  return <div className="mx-auto max-w-3xl space-y-7">
    <div className="rounded-xl border bg-muted/20 p-4 sm:p-5">
      <label htmlFor="study-question" className="mb-2 block text-sm font-semibold">Sua dúvida</label>
      <textarea
        id="study-question"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void submitQuestion() }}
        maxLength={2000}
        rows={4}
        disabled={generating}
        placeholder="Digite sua dúvida sobre esta questão..."
        className="min-h-28 w-full resize-y rounded-lg border bg-background p-3 text-sm leading-relaxed shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">Use Ctrl + Enter para enviar.</p>
        <Button type="button" onClick={() => void submitQuestion()} disabled={generating || !question.trim()} className="w-full sm:w-auto">{generating ? <Loader2 className="animate-spin" /> : <Send />}{generating ? 'Analisando sua pergunta...' : 'Perguntar à IA'}</Button>
      </div>
      {messages.length === 0 && <div className="mt-5 border-t pt-4"><p className="mb-2 text-xs font-medium text-muted-foreground">Experimente perguntar:</p><div className="flex flex-wrap gap-2">{questionExamples.map((example) => <button key={example} type="button" onClick={() => setQuestion(example)} disabled={generating} className="rounded-full border bg-background px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">{example}</button>)}</div></div>}
    </div>

    {messages.length === 0 && !generating && <div className="py-4 text-center"><Bot className="mx-auto mb-3 h-9 w-9 text-muted-foreground" aria-hidden="true" /><p className="font-medium">Assistente de estudo</p><p className="mt-1 text-sm text-muted-foreground">Faça uma pergunta específica para aprofundar seu entendimento.</p></div>}

    {messages.map((message, index) => <article key={index} className="space-y-4 border-t pt-6 first:border-t-0 first:pt-0">
      <section className="ml-auto max-w-2xl rounded-xl bg-primary p-4 text-primary-foreground"><p className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-70">Minha pergunta</p><p className="text-sm leading-relaxed">{message.pergunta}</p></section>
      <section className="rounded-xl border bg-card p-4 sm:p-5"><p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Bot className="h-4 w-4" aria-hidden="true" />Resposta da IA</p><StudyMarkdown content={message.resposta} mode="perguntar" /></section>
    </article>)}

    {generating && <div className="flex min-h-24 items-center justify-center gap-3 rounded-xl border border-dashed text-sm text-muted-foreground" role="status"><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />Analisando sua pergunta...</div>}
  </div>
}
