import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DifficultSubject } from '@/services/desempenho.service'

interface DifficultSubjectsProps { subjects: DifficultSubject[]; loading?: boolean }

export function DifficultSubjects({ subjects, loading }: DifficultSubjectsProps) {
  if (loading) return <Card><CardHeader><Skeleton className="h-5 w-1/2" /></CardHeader><CardContent className="space-y-4">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-16 w-full" />)}</CardContent></Card>

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-500" />Assuntos com maior dificuldade</CardTitle></CardHeader>
      <CardContent>
        {subjects.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">Responda simulados para identificar seus assuntos mais difíceis.</p> : (
          <div className="space-y-4">{subjects.map((subject) => (
            <div key={`${subject.disciplina}-${subject.assunto}`} className="space-y-2">
              <div className="flex items-start justify-between gap-3"><div><p className="font-medium">{subject.assunto}</p><p className="text-sm text-muted-foreground">{subject.disciplina}</p></div><span className={cn('whitespace-nowrap rounded px-2 py-1 text-sm font-semibold', subject.erroRate >= 70 ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : subject.erroRate >= 50 ? 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300')}>{subject.erroRate}% de erro</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn('h-full', subject.erroRate >= 70 ? 'bg-red-500' : subject.erroRate >= 50 ? 'bg-orange-500' : 'bg-yellow-500')} style={{ width: `${subject.erroRate}%` }} /></div>
              <p className="text-xs text-muted-foreground">{subject.questoes} questões respondidas</p>
            </div>
          ))}</div>
        )}
      </CardContent>
    </Card>
  )
}
