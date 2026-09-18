'use client'

import Link from 'next/link'
import { BookOpen, Building2, CalendarDays, CheckCircle2, FileText, Trophy } from 'lucide-react'
import { useConcursoStore } from '@/stores/concurso.store'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface Exam {
  id: string
  nome: string
  cargo: string | null
  especialidade: string | null
  codigo_prova: string | null
  turno: string | null
}

interface Contest {
  id: string
  nome: string
  orgao: string
  banca: string | null
  ano: number | null
  edital: string | null
  cargo: string | null
  especialidade: string | null
  data_prova: string | null
  descricao: string | null
  provas: Exam[]
  quantidadeQuestoes: number
}

export function ConcursosList({ contests, error }: { contests: Contest[]; error: string | null }) {
  const { concursoAtual, setConcursoAtual } = useConcursoStore()

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Concursos</h1><p className="text-muted-foreground">Escolha seu concurso e consulte as provas e questões disponíveis.</p></div>
      {error && <Alert variant="destructive">{error}</Alert>}
      {!error && contests.length === 0 && <Card><CardContent className="py-14 text-center"><Trophy className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><p className="font-semibold">Nenhum concurso disponível</p><p className="text-sm text-muted-foreground">O catálogo está vazio ou seu acesso ainda não foi liberado.</p></CardContent></Card>}
      <div className="grid gap-5 xl:grid-cols-2">
        {contests.map((contest) => {
          const selected = concursoAtual === contest.id
          return <Card key={contest.id} className={selected ? 'border-primary ring-1 ring-primary' : ''}>
            <CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{contest.nome}</CardTitle><CardDescription className="mt-1 flex items-center gap-1"><Building2 className="h-4 w-4" />{contest.orgao}</CardDescription></div>{selected && <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs text-primary-foreground"><CheckCircle2 className="h-3.5 w-3.5" />Selecionado</span>}</div></CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">{contest.ano && <span className="rounded bg-muted px-2 py-1">{contest.ano}</span>}{contest.banca && <span className="rounded bg-muted px-2 py-1">{contest.banca}</span>}{contest.cargo && <span className="rounded bg-muted px-2 py-1">{contest.cargo}</span>}{contest.especialidade && <span className="rounded bg-muted px-2 py-1">{contest.especialidade}</span>}{contest.data_prova && <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1"><CalendarDays className="h-3 w-3" />{new Intl.DateTimeFormat('pt-BR').format(new Date(`${contest.data_prova}T12:00:00`))}</span>}</div>
              {contest.descricao && <p className="text-sm text-muted-foreground">{contest.descricao}</p>}
              <div className="grid grid-cols-2 gap-3"><div className="rounded-md border p-3"><p className="flex items-center gap-2 text-sm text-muted-foreground"><FileText className="h-4 w-4" />Provas</p><p className="mt-1 text-2xl font-bold">{contest.provas.length}</p></div><div className="rounded-md border p-3"><p className="flex items-center gap-2 text-sm text-muted-foreground"><BookOpen className="h-4 w-4" />Questões</p><p className="mt-1 text-2xl font-bold">{contest.quantidadeQuestoes}</p></div></div>
              {contest.provas.length > 0 && <div><p className="mb-2 text-sm font-semibold">Provas disponíveis</p><div className="space-y-2">{contest.provas.map((exam) => <div key={exam.id} className="rounded-md bg-muted/60 p-3 text-sm"><p className="font-medium">{exam.nome}</p><p className="text-xs text-muted-foreground">{[exam.cargo, exam.especialidade, exam.codigo_prova, exam.turno].filter(Boolean).join(' · ')}</p></div>)}</div></div>}
              <div className="flex flex-wrap gap-2"><Button onClick={() => setConcursoAtual(contest.id)} variant={selected ? 'secondary' : 'default'}>{selected ? 'Concurso selecionado' : 'Selecionar concurso'}</Button><Button asChild variant="outline"><Link href="/questoes">Resolver questões</Link></Button><Button asChild variant="outline"><Link href="/simulados">Criar simulado</Link></Button></div>
            </CardContent>
          </Card>
        })}
      </div>
    </div>
  )
}
