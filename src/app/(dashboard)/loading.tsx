import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Carregando conteúdo">
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32" />)}
      </div>
      <Skeleton className="h-72 w-full" />
      <span className="sr-only">Carregando...</span>
    </div>
  )
}
