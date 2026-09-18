'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { BookOpen, GraduationCap, Layers3, Search } from 'lucide-react'
import { useConcursoStore } from '@/stores/concurso.store'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface StudyQuestion { id: string; concurso_id: string | null; disciplina: string | null; assunto: string | null; subassunto: string | null }

export function StudyCatalog({ questions, error }: { questions: StudyQuestion[]; error: string | null }) {
  const concursoAtual = useConcursoStore((state) => state.concursoAtual)
  const [discipline, setDiscipline] = useState('')
  const [subject, setSubject] = useState('')
  const scoped = useMemo(() => questions.filter((item) => !concursoAtual || item.concurso_id === concursoAtual), [questions, concursoAtual])
  const disciplines = useMemo(() => unique(scoped.map((item) => item.disciplina)), [scoped])
  const subjects = useMemo(() => unique(scoped.filter((item) => !discipline || item.disciplina === discipline).map((item) => item.assunto)), [scoped, discipline])
  const grouped = useMemo(() => {
    const map = new Map<string, { discipline: string; subject: string; subsubjects: Set<string>; count: number }>()
    scoped.filter((item) => (!discipline || item.disciplina === discipline) && (!subject || item.assunto === subject)).forEach((item) => {
      const d = item.disciplina?.trim() || 'Sem disciplina'
      const s = item.assunto?.trim() || 'Sem assunto'
      const key = `${d}\u0000${s}`
      const current = map.get(key) ?? { discipline: d, subject: s, subsubjects: new Set<string>(), count: 0 }
      current.count += 1
      if (item.subassunto?.trim()) current.subsubjects.add(item.subassunto.trim())
      map.set(key, current)
    })
    return Array.from(map.values()).sort((a, b) => a.discipline.localeCompare(b.discipline, 'pt-BR') || a.subject.localeCompare(b.subject, 'pt-BR'))
  }, [scoped, discipline, subject])

  const questionUrl = (d: string, s: string) => `/questoes?${new URLSearchParams({ ...(concursoAtual ? { concurso: concursoAtual } : {}), disciplina: d, assunto: s })}`

  return <div className="space-y-6">
    <div><h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl"><GraduationCap className="h-8 w-8 text-primary" />Estudar</h1><p className="text-muted-foreground">Escolha um conteúdo e pratique com as questões relacionadas.</p></div>
    {error && <Alert variant="destructive">{error} Confirme as permissões do catálogo.</Alert>}
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Search className="h-5 w-5" />Selecionar conteúdo</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
      <label className="space-y-2 text-sm font-medium"><span>Disciplina</span><select value={discipline} onChange={(event) => { setDiscipline(event.target.value); setSubject('') }} className="h-10 w-full rounded-md border bg-background px-3"><option value="">Todas as disciplinas</option>{disciplines.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="space-y-2 text-sm font-medium"><span>Assunto</span><select value={subject} onChange={(event) => setSubject(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3"><option value="">Todos os assuntos</option>{subjects.map((item) => <option key={item}>{item}</option>)}</select></label>
    </CardContent></Card>
    {!error && grouped.length === 0 ? <Card><CardContent className="py-14 text-center"><BookOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><p className="font-semibold">Nenhum conteúdo encontrado</p><p className="text-sm text-muted-foreground">Selecione outro concurso ou aguarde a inclusão de questões.</p></CardContent></Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{grouped.map((item) => <Card key={`${item.discipline}-${item.subject}`}><CardHeader><p className="text-sm font-medium text-primary">{item.discipline}</p><CardTitle className="text-lg">{item.subject}</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><BookOpen className="h-4 w-4" />{item.count} questão(ões)</div>{item.subsubjects.size > 0 && <div className="flex items-start gap-2 text-xs text-muted-foreground"><Layers3 className="mt-0.5 h-4 w-4 shrink-0" /><span>{Array.from(item.subsubjects).join(' · ')}</span></div>}<Button asChild className="w-full"><Link href={questionUrl(item.discipline, item.subject)}>Praticar este assunto</Link></Button></CardContent></Card>)}</div>}
  </div>
}

function unique(values: Array<string | null>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
