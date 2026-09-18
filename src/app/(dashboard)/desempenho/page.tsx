'use client'

import { AlertCircle, CheckCircle2, RotateCcw, Target, TrendingDown, TrendingUp, XCircle } from 'lucide-react'
import { useDesempenho } from '@/hooks/useDesempenho'
import { MetricCard } from '@/components/dashboard/metric-card'
import { SimpleChart } from '@/components/dashboard/simple-chart'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function RankingList({ title, items, attention = false }: { title: string; items: Array<{ label: string; total: number; percentual: number }>; attention?: boolean }) {
  return <Card><CardHeader><CardTitle className="flex items-center gap-2">{attention ? <TrendingDown className="h-5 w-5 text-orange-500" /> : <TrendingUp className="h-5 w-5 text-green-600" />}{title}</CardTitle></CardHeader><CardContent>{items.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Responda ao menos três questões por assunto para gerar este ranking.</p> : <div className="space-y-3">{items.map((item, index) => <div key={item.label} className="flex items-center gap-3 rounded-lg border p-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted font-bold">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate font-medium">{item.label}</p><p className="text-xs text-muted-foreground">{item.total} questões</p></div><span className={attention ? 'font-semibold text-orange-600' : 'font-semibold text-green-600'}>{item.percentual}%</span></div>)}</div>}</CardContent></Card>
}

export default function DesempenhoPage() {
  const { data, loading, error, reload } = useDesempenho()
  if (error && !data) return <div className="mx-auto max-w-2xl py-12"><Alert variant="destructive" className="space-y-3"><div className="flex gap-2"><AlertCircle className="h-5 w-5" /><p>{error}</p></div><Button size="sm" variant="outline" onClick={reload}><RotateCcw />Tentar novamente</Button></Alert></div>
  const metrics = data?.metricas
  return <div className="space-y-6 fade-in"><div><h1 className="text-2xl font-bold md:text-3xl">Desempenho</h1><p className="text-muted-foreground">Analise sua evolução e priorize os assuntos que precisam de atenção.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard title="Percentual geral" value={`${metrics?.percentual ?? 0}%`} icon={Target} loading={loading} /><MetricCard title="Questões respondidas" value={metrics?.respondidas ?? 0} icon={RotateCcw} loading={loading} /><MetricCard title="Acertos" value={metrics?.acertos ?? 0} icon={CheckCircle2} loading={loading} /><MetricCard title="Erros" value={metrics?.erros ?? 0} icon={XCircle} loading={loading} /></div>
    <div className="grid gap-6 xl:grid-cols-2"><SimpleChart title="Evolução diária — últimos 30 dias (%)" loading={loading} data={(data?.evolucao_diaria ?? []).map((item) => ({ label: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(`${item.data}T12:00:00`)), value: item.percentual }))} /><SimpleChart title="Evolução nos simulados (%)" loading={loading} data={(data?.evolucao_simulados ?? []).map((item) => ({ label: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(item.data)), value: item.percentual }))} /><SimpleChart title="Desempenho por disciplina (%)" loading={loading} data={(data?.por_disciplina ?? []).map((item) => ({ label: item.label, value: item.percentual }))} /><SimpleChart title="Desempenho por assunto (%)" loading={loading} data={(data?.por_assunto ?? []).map((item) => ({ label: item.label, value: item.percentual }))} /><SimpleChart title="Distribuição de erros por dificuldade" loading={loading} data={(data?.erros_por_dificuldade ?? []).map((item) => ({ label: item.label, value: item.total }))} /></div>
    <div className="grid gap-6 xl:grid-cols-2"><RankingList title="Melhores assuntos" items={data?.melhores_assuntos ?? []} /><RankingList title="Assuntos que precisam de atenção" items={data?.assuntos_atencao ?? []} attention /></div>
  </div>
}
