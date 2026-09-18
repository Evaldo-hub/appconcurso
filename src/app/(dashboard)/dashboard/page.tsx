'use client'

import { useRouter } from 'next/navigation'
import { AlertCircle, BookCheck, CheckCircle2, Clock3, FileCheck2, RotateCcw, Target, XCircle } from 'lucide-react'
import { useDashboard } from '@/hooks/useDashboard'
import { MetricCard } from '@/components/dashboard/metric-card'
import { SimpleChart } from '@/components/dashboard/simple-chart'
import { RecentActivities } from '@/components/dashboard/recent-activities'
import { DifficultSubjects } from '@/components/dashboard/difficult-subjects'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function formatDuration(totalSeconds: number) {
  if (totalSeconds <= 0) return '0 min'
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${minutes}min` : `${Math.max(minutes, 1)} min`
}

export default function DashboardPage() {
  const router = useRouter()
  const { data, loading, error, reload } = useDashboard()
  const metrics = data?.metrics

  if (error && !data) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <Alert variant="destructive" className="space-y-4">
          <div className="flex gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <div><p className="font-semibold">Não foi possível carregar o Dashboard</p><p className="text-sm">{error}</p></div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void reload()}><RotateCcw /> Tentar novamente</Button>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6 fade-in">
      <div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Dashboard</h1><p className="text-muted-foreground">Acompanhe seu progresso nos estudos.</p></div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Questões respondidas" value={metrics?.questoesRespondidas ?? 0} icon={BookCheck} loading={loading} />
        <MetricCard title="Acertos" value={metrics?.acertos ?? 0} icon={CheckCircle2} loading={loading} />
        <MetricCard title="Erros" value={metrics?.erros ?? 0} icon={XCircle} loading={loading} />
        <MetricCard title="Percentual de acerto" value={`${metrics?.percentualAcerto ?? 0}%`} icon={Target} loading={loading} />
        <MetricCard title="Tempo registrado" value={formatDuration(metrics?.tempoEstudado ?? 0)} icon={Clock3} loading={loading} />
        <MetricCard title="Simulados realizados" value={metrics?.simuladosRealizados ?? 0} icon={FileCheck2} loading={loading} />
        <MetricCard title="Pendentes de revisão" value={metrics?.questoesPendentesRevisao ?? '—'} icon={RotateCcw} loading={loading} />
      </div>

      {!loading && data?.limitedMetrics.length ? <p className="text-xs text-muted-foreground">Dados atuais baseados nos simulados. {data.limitedMetrics.join(' ')}</p> : null}

      {!loading && data?.continueStudying && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader><CardTitle>Continuar estudando</CardTitle><CardDescription>{data.continueStudying.titulo}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">{data.continueStudying.respondidas} de {data.continueStudying.total} questões respondidas</p>
            <Button onClick={() => router.push(`/simulados/${data.continueStudying!.id}`)}>Continuar simulado</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <SimpleChart title="Desempenho por disciplina (%)" data={(data?.performanceByDiscipline ?? []).map((item) => ({ label: item.label, value: item.percentual }))} loading={loading} />
        <SimpleChart title="Evolução nos simulados (%)" data={data?.evolution ?? []} loading={loading} />
        <SimpleChart title="Desempenho por assunto (%)" data={(data?.performanceBySubject ?? []).map((item) => ({ label: item.label, value: item.percentual }))} loading={loading} />
        <DifficultSubjects subjects={data?.difficultSubjects ?? []} loading={loading} />
      </div>

      <RecentActivities activities={data?.recentActivities ?? []} loading={loading} />
    </div>
  )
}
