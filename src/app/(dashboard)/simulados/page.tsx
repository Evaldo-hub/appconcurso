'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Clock3, FileText, Loader2, Play, Plus } from 'lucide-react'
import { initialSimuladoConfig, useSimulados } from '@/hooks/useSimulados'
import type { SimuladoConfig } from '@/services/simulados.service'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

export default function SimuladosPage() {
  const router = useRouter()
  const { options, items, loading, creating, error, create } = useSimulados()
  const [config, setConfig] = useState<SimuladoConfig>(initialSimuladoConfig)
  const set = <K extends keyof SimuladoConfig>(key: K, value: SimuladoConfig[K]) => setConfig((current) => ({ ...current, [key]: value }))
  const start = async () => { const id = await create(config); if (id) router.push(`/simulados/${id}`) }

  return <div className="space-y-6 fade-in">
    <div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Simulados</h1><p className="text-muted-foreground">Monte uma prova personalizada e acompanhe seu progresso.</p></div>
    {error && <Alert variant="destructive"><div className="flex gap-2"><AlertCircle className="h-5 w-5" /><p>{error}</p></div></Alert>}

    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />Novo simulado</CardTitle><CardDescription>Escolha os filtros e a quantidade de questões.</CardDescription></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1.5 text-sm font-medium"><span>Concurso</span><select required value={config.concursoId} onChange={(event) => set('concursoId', event.target.value)} className="h-10 w-full rounded-md border bg-background px-3"><option value="">Selecione</option>{options.concursos.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="space-y-1.5 text-sm font-medium"><span>Disciplina</span><select value={config.disciplina} onChange={(event) => set('disciplina', event.target.value)} className="h-10 w-full rounded-md border bg-background px-3"><option value="">Todas as disciplinas</option>{options.disciplinas.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="space-y-1.5 text-sm font-medium"><span>Assunto</span><select value={config.assunto} onChange={(event) => set('assunto', event.target.value)} className="h-10 w-full rounded-md border bg-background px-3"><option value="">Todos os assuntos</option>{options.assuntos.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="space-y-1.5 text-sm font-medium"><span>Quantidade</span><Input type="number" min={1} max={100} value={config.quantidade} onChange={(event) => set('quantidade', Math.min(100, Math.max(1, Number(event.target.value))))} /></label>
        </div>
        <div className="flex flex-wrap gap-2">{[10, 20, 30, 50].map((amount) => <Button key={amount} type="button" size="sm" variant={config.quantidade === amount ? 'default' : 'outline'} onClick={() => set('quantidade', amount)}>{amount} questões</Button>)}</div>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={config.cronometro} onChange={(event) => set('cronometro', event.target.checked)} className="h-4 w-4" /><span>Exibir cronômetro durante o simulado</span></label>
        <Button onClick={() => void start()} disabled={creating || loading || !config.concursoId}>{creating ? <Loader2 className="animate-spin" /> : <Play />}{creating ? 'Criando...' : 'Iniciar simulado'}</Button>
      </CardContent>
    </Card>

    <section className="space-y-3"><h2 className="text-lg font-semibold">Seus simulados recentes</h2>
      {loading ? <div className="grid gap-3 md:grid-cols-2">{[1, 2].map((item) => <Skeleton key={item} className="h-32" />)}</div>
      : items.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Você ainda não iniciou nenhum simulado.</CardContent></Card>
      : <div className="grid gap-3 md:grid-cols-2">{items.map((item) => <Card key={item.id}><CardContent className="flex items-center gap-4 p-5"><div className="rounded-full bg-primary/10 p-3"><FileText className="h-5 w-5 text-primary" /></div><div className="min-w-0 flex-1"><p className="truncate font-semibold">{item.assunto || item.disciplina || 'Todas as disciplinas'}</p><p className="text-sm text-muted-foreground">{item.respondidas} de {item.quantidade} respondidas{item.status === 'concluido' ? ` • ${item.acertos} acertos` : ''}</p><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3 w-3" />{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(item.criadoEm))}</p></div>{item.status === 'em_andamento' ? <Button size="sm" onClick={() => router.push(`/simulados/${item.id}`)}>Continuar</Button> : <Button size="sm" variant="outline" onClick={() => router.push(`/simulados/${item.id}/resultado`)}>Ver resultado</Button>}</CardContent></Card>)}</div>}
    </section>
  </div>
}
