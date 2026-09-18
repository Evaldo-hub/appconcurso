import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckCircle, Clock, FileText, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DashboardActivity } from '@/services/desempenho.service'

interface RecentActivitiesProps { activities: DashboardActivity[]; loading?: boolean }

export function RecentActivities({ activities, loading }: RecentActivitiesProps) {
  if (loading) return <Card><CardHeader><Skeleton className="h-5 w-1/2" /></CardHeader><CardContent className="space-y-4">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-14 w-full" />)}</CardContent></Card>

  return (
    <Card>
      <CardHeader><CardTitle>Atividades recentes</CardTitle></CardHeader>
      <CardContent>
        {activities.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Seus simulados aparecerão aqui quando você começar a estudar.</p> : (
          <div className="space-y-2">{activities.map((activity) => {
            const positive = activity.resultado === 'concluido' || activity.resultado === 'acerto'
            const negative = activity.resultado === 'erro'
            const StatusIcon = negative ? XCircle : positive ? CheckCircle : Clock
            return <div key={activity.id} className="flex items-center gap-3 rounded-lg p-3 hover:bg-muted/50">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10"><FileText className="h-5 w-5 text-primary" /></div>
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{activity.titulo}</p><p className="text-sm text-muted-foreground">{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(activity.data))}</p></div>
              <StatusIcon className={cn('h-5 w-5', negative ? 'text-red-600' : positive ? 'text-green-600' : 'text-amber-600')} /><span className="sr-only">{negative ? 'Erro' : positive ? 'Concluído ou correto' : 'Em andamento'}</span>
            </div>
          })}</div>
        )}
      </CardContent>
    </Card>
  )
}
