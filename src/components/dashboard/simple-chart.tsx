import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface ChartData { label: string; value: number }
interface SimpleChartProps { title: string; data: ChartData[]; loading?: boolean }

export function SimpleChart({ title, data, loading }: SimpleChartProps) {
  if (loading) return <Card><CardHeader><Skeleton className="h-5 w-1/2" /></CardHeader><CardContent><Skeleton className="h-64 w-full" /></CardContent></Card>
  const maxValue = Math.max(...data.map((item) => item.value), 1)

  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {data.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">Ainda não há dados suficientes para este gráfico.</p> : (
          <div className="space-y-4">{data.map((item) => (
            <div key={item.label} className="space-y-2">
              <div className="flex justify-between gap-4 text-sm"><span className="truncate font-medium">{item.label}</span><span className="text-muted-foreground">{item.value}</span></div>
              <div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all duration-500" style={{ width: `${(item.value / maxValue) * 100}%` }} /></div>
            </div>
          ))}</div>
        )}
      </CardContent>
    </Card>
  )
}
