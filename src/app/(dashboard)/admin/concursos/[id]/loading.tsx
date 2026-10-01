import { Skeleton } from '@/components/ui/skeleton'

export default function LoadingContestAdmin() {
  return <div className="space-y-8"><Skeleton className="h-72 w-full" /><div className="space-y-3"><Skeleton className="h-7 w-48" /><Skeleton className="h-32 w-full" /></div><div className="space-y-3"><Skeleton className="h-7 w-48" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div><Skeleton className="h-48 w-full" /></div></div>
}
