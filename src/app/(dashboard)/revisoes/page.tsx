'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, BookOpenCheck, Heart, History, Loader2, Play, TrendingDown } from 'lucide-react'
import { useRevisoes } from '@/hooks/useRevisoes'
import type { ReviewCategory } from '@/services/revisoes.service'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const categories: Array<{ value: ReviewCategory; label: string; icon: typeof History }> = [
  { value: 'todas', label: 'Todas', icon: BookOpenCheck }, { value: 'erradas', label: 'Questões erradas', icon: AlertCircle },
  { value: 'favoritas', label: 'Favoritas', icon: Heart }, { value: 'marcadas', label: 'Marcadas', icon: History },
  { value: 'baixo_desempenho', label: 'Baixo desempenho', icon: TrendingDown },
]

export default function RevisoesPage() {
  const router = useRouter(); const { items, sessions, loading, creating, error, createSession } = useRevisoes(); const [category, setCategory] = useState<ReviewCategory>('todas'); const [limit, setLimit] = useState(15)
  const counts = { todas: items.length, erradas: items.filter((item) => item.errada).length, favoritas: items.filter((item) => item.favorita).length, marcadas: items.filter((item) => item.marcada).length, baixo_desempenho: items.filter((item) => item.baixoDesempenho).length }
  const visible = useMemo(() => items.filter((item) => category === 'todas' || (category === 'erradas' && item.errada) || (category === 'favoritas' && item.favorita) || (category === 'marcadas' && item.marcada) || (category === 'baixo_desempenho' && item.baixoDesempenho)), [category, items])
  const start = async () => { const id = await createSession(category, limit); if (id) router.push(`/revisoes/${id}`) }

  return <div className="space-y-6 fade-in"><div><h1 className="text-2xl font-bold md:text-3xl">Central de revisões</h1><p className="text-muted-foreground">Reforce seus erros e conteúdos que precisam de atenção.</p></div>
    {error && <Alert variant="destructive"><div className="flex gap-2"><AlertCircle className="h-5 w-5" /><p>{error}</p></div></Alert>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{categories.map(({ value, label, icon: Icon }) => <button key={value} onClick={() => setCategory(value)} className={`rounded-xl border p-4 text-left transition-colors ${category === value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card hover:bg-muted/50'}`}><Icon className="mb-3 h-5 w-5" /><p className="text-2xl font-bold">{loading ? '—' : counts[value]}</p><p className="text-sm text-muted-foreground">{label}</p></button>)}</div>
    <Card><CardHeader><CardTitle>Revisão de hoje</CardTitle></CardHeader><CardContent className="flex flex-wrap items-end gap-3"><label className="space-y-1 text-sm"><span className="font-medium">Quantidade</span><input type="number" min={1} max={50} value={limit} onChange={(event) => setLimit(Math.min(50, Math.max(1, Number(event.target.value))))} className="block h-9 w-28 rounded-md border bg-background px-3" /></label><Button onClick={() => void start()} disabled={creating || loading || counts[category] === 0}>{creating ? <Loader2 className="animate-spin" /> : <Play />}Iniciar revisão</Button><p className="text-sm text-muted-foreground">Até {Math.min(limit, counts[category])} questões desta categoria.</p></CardContent></Card>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Questões para revisar</h2>{loading ? <>{[1,2,3].map((item) => <Skeleton key={item} className="h-24" />)}</> : visible.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhuma questão nesta categoria.</CardContent></Card> : visible.slice(0, 20).map((item) => <Card key={item.id}><CardContent className="p-5"><div className="flex flex-wrap gap-2 text-xs text-muted-foreground"><span>{item.disciplina}</span><span>•</span><span>{item.assunto}</span>{item.errada && <span className="rounded bg-red-100 px-2 text-red-700">Erro</span>}{item.favorita && <span className="rounded bg-pink-100 px-2 text-pink-700">Favorita</span>}{item.marcada && <span className="rounded bg-amber-100 px-2 text-amber-700">Marcada</span>}</div><p className="mt-2 line-clamp-2 text-sm">{item.enunciado}</p></CardContent></Card>)}</section>
    {sessions.length > 0 && <section className="space-y-3"><h2 className="text-lg font-semibold">Sessões recentes</h2><div className="grid gap-3 md:grid-cols-2">{sessions.map((session) => <Card key={session.id}><CardContent className="flex items-center justify-between gap-3 p-4"><div><p className="font-medium">{session.titulo}</p><p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat('pt-BR').format(new Date(session.criadoEm))}</p></div>{session.status === 'em_andamento' ? <Button size="sm" onClick={() => router.push(`/revisoes/${session.id}`)}>Continuar</Button> : <span className="text-sm text-green-600">Concluída</span>}</CardContent></Card>)}</div></section>}
  </div>
}
