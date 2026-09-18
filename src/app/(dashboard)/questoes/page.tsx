'use client'

import { AlertCircle, Bookmark, CheckCircle2, ChevronLeft, ChevronRight, Filter, Heart, Loader2, RotateCcw, Search, XCircle } from 'lucide-react'
import { useQuestoes } from '@/hooks/useQuestoes'
import { useRouter } from 'next/navigation'
import type { FilterOption, QuestionFilters } from '@/services/questoes.service'
import { cn } from '@/lib/utils'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface FilterSelectProps { label: string; value: string; options: FilterOption[]; onChange: (value: string) => void }
function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  return <label className="space-y-1.5 text-sm font-medium"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"><option value="">Todos</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
}

const filterFields: Array<{ key: Exclude<keyof QuestionFilters, 'status' | 'ids'>; label: string }> = [
  { key: 'concursoId', label: 'Concurso' }, { key: 'provaId', label: 'Prova' }, { key: 'banca', label: 'Banca' },
  { key: 'disciplina', label: 'Disciplina' }, { key: 'assunto', label: 'Assunto' }, { key: 'subassunto', label: 'Subassunto' }, { key: 'dificuldade', label: 'Dificuldade' },
]

const statusOptions: FilterOption[] = [
  { value: 'respondidas', label: 'Respondidas' }, { value: 'nao_respondidas', label: 'Não respondidas' },
  { value: 'acertadas', label: 'Acertadas' }, { value: 'erradas', label: 'Erradas' },
]

export default function QuestoesPage() {
  const router = useRouter()
  const { draftFilters, options, page, index, loading, error, selectedAlternative, answerResult, answering, answerError, reviewState, savingReview, updateFilter, applyFilters, clearFilters, selectAlternative, answer, toggleFavorite, toggleReview, previous, next, reload } = useQuestoes()
  const question = page.question

  const optionList = (key: Exclude<keyof QuestionFilters, 'status' | 'ids'>) => options[key === 'concursoId' ? 'concursos' : key === 'provaId' ? 'provas' : key === 'banca' ? 'bancas' : key === 'disciplina' ? 'disciplinas' : key === 'assunto' ? 'assuntos' : key === 'subassunto' ? 'subassuntos' : 'dificuldades']

  return (
    <div className="space-y-6 fade-in">
      <div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Banco de questões</h1><p className="text-muted-foreground">Resolva questões e acompanhe seu desempenho.</p></div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Filter className="h-5 w-5" />Filtros</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filterFields.map((field) => <FilterSelect key={field.key} label={field.label} value={draftFilters[field.key]} options={optionList(field.key)} onChange={(value) => updateFilter(field.key, value)} />)}
            <FilterSelect label="Situação" value={draftFilters.status} options={statusOptions} onChange={(value) => updateFilter('status', value as QuestionFilters['status'])} />
          </div>
          <div className="flex flex-wrap gap-2"><Button onClick={applyFilters} disabled={loading}><Search />Aplicar filtros</Button><Button variant="outline" onClick={clearFilters} disabled={loading}><RotateCcw />Limpar</Button></div>
          <p className="text-xs text-muted-foreground">O filtro de favoritas será incluído na central de revisões da Fase 9.</p>
        </CardContent>
      </Card>

      {error ? <Alert variant="destructive" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-2"><AlertCircle className="mt-0.5 h-5 w-5" /><div><p className="font-semibold">Falha ao consultar questões</p><p className="text-sm">{error}</p></div></div><Button variant="outline" size="sm" onClick={reload}><RotateCcw />Tentar novamente</Button></Alert>
      : loading ? <Card><CardHeader className="space-y-3"><Skeleton className="h-5 w-2/5" /><Skeleton className="h-4 w-3/5" /></CardHeader><CardContent className="space-y-4"><Skeleton className="h-24 w-full" />{[1, 2, 3, 4, 5].map((item) => <Skeleton key={item} className="h-14 w-full" />)}</CardContent></Card>
      : !question ? <Card><CardContent className="py-16 text-center"><Search className="mx-auto mb-4 h-10 w-10 text-muted-foreground" /><h2 className="font-semibold">Nenhuma questão encontrada</h2><p className="mt-1 text-sm text-muted-foreground">Altere os filtros ou aguarde novas questões serem adicionadas.</p></CardContent></Card>
      : <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-medium text-muted-foreground">Questão {index + 1} de {page.total}</p><div className="flex flex-wrap items-center gap-2 text-xs"><Button size="sm" variant={reviewState.favorita ? 'default' : 'outline'} onClick={() => void toggleFavorite()} disabled={savingReview}><Heart />{reviewState.favorita ? 'Favorita' : 'Favoritar'}</Button><Button size="sm" variant={reviewState.marcada ? 'default' : 'outline'} onClick={() => void toggleReview()} disabled={savingReview}><Bookmark />{reviewState.marcada ? 'Marcada' : 'Revisar depois'}</Button>{question.banca && <span className="rounded-full bg-muted px-3 py-1">{question.banca}</span>}{question.dificuldade && <span className="rounded-full bg-muted px-3 py-1 capitalize">{question.dificuldade}</span>}</div></div>
            <div><CardTitle className="text-lg">{question.disciplina}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{[question.assunto, question.subassunto].filter(Boolean).join(' • ')}</p></div>
            {(question.concurso || question.prova) && <p className="text-xs text-muted-foreground">{[question.concurso?.nome, question.prova?.nome, question.prova?.cargo].filter(Boolean).join(' — ')}</p>}
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="whitespace-pre-wrap text-base leading-relaxed">{question.enunciado}</p>
            <fieldset className="space-y-3" disabled={Boolean(answerResult) || answering}><legend className="sr-only">Escolha uma alternativa</legend>{question.alternativas.map((alternativa) => {
              const selected = selectedAlternative === alternativa.letra
              const correct = answerResult?.alternativaCorreta === alternativa.letra
              const wrongSelection = Boolean(answerResult && selected && !answerResult.correta)
              return <button type="button" key={alternativa.letra} onClick={() => selectAlternative(alternativa.letra)} className={cn('flex w-full gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 disabled:cursor-default', selected && !answerResult && 'border-primary bg-primary/5 ring-1 ring-primary', correct && 'border-green-600 bg-green-50 dark:bg-green-950/30', wrongSelection && 'border-red-600 bg-red-50 dark:bg-red-950/30')} aria-pressed={selected}>
                <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-semibold', selected && !answerResult && 'border-primary bg-primary text-primary-foreground', correct && 'border-green-600 bg-green-600 text-white', wrongSelection && 'border-red-600 bg-red-600 text-white')}>{alternativa.letra}</span><span className="whitespace-pre-wrap pt-0.5 text-sm leading-relaxed">{alternativa.texto}</span>
              </button>
            })}</fieldset>

            {!answerResult && <Button className="w-full sm:w-auto" onClick={() => void answer()} disabled={!selectedAlternative || answering}>{answering ? <Loader2 className="animate-spin" /> : null}{answering ? 'Corrigindo...' : 'Responder'}</Button>}
            {answerError && <Alert variant="destructive"><div className="flex gap-2"><AlertCircle className="mt-0.5 h-5 w-5" /><p className="text-sm">{answerError}</p></div></Alert>}
            {answerResult && <Alert className={answerResult.correta ? 'border-green-600 bg-green-50 dark:bg-green-950/30' : 'border-red-600 bg-red-50 dark:bg-red-950/30'}><div className="flex gap-3">{answerResult.correta ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-600" />}<div className="space-y-3"><p className="font-semibold">{answerResult.correta ? 'Resposta correta!' : `Resposta incorreta. Alternativa correta: ${answerResult.alternativaCorreta}`}</p>{answerResult.explicacao ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{answerResult.explicacao}</p> : <p className="text-sm text-muted-foreground">Esta questão ainda não possui explicação cadastrada.</p>}<Button size="sm" onClick={() => router.push(`/questoes/${question.id}/estudar`)}>Estudar esta questão</Button></div></div></Alert>}

            <div className="flex items-center justify-between border-t pt-5"><Button variant="outline" onClick={previous} disabled={index === 0}><ChevronLeft />Anterior</Button><Button onClick={next} disabled={index + 1 >= page.total}>Próxima<ChevronRight /></Button></div>
          </CardContent>
        </Card>}
    </div>
  )
}
