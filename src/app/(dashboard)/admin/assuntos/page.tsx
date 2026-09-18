import Link from 'next/link'
import { Layers3 } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default async function AdminSubjectsPage({ searchParams }: PageProps<'/admin/assuntos'>) {
  const params = await searchParams
  const selectedDiscipline = typeof params.disciplina === 'string' ? params.disciplina.slice(0, 200) : ''
  const admin = createAdminClient()
  let query = admin.from('questoes_estudo').select('disciplina, assunto, subassunto').range(0, 9999)
  if (selectedDiscipline) query = query.eq('disciplina', selectedDiscipline)
  const { data, error } = await query
  const groups = new Map<string, { discipline: string; subject: string; questions: number; subsubjects: Set<string> }>()
  for (const row of data ?? []) { const discipline = row.disciplina?.trim(); const subject = row.assunto?.trim(); if (!discipline || !subject) continue; const key = `${discipline}\u0000${subject}`; const current = groups.get(key) ?? { discipline, subject, questions: 0, subsubjects: new Set<string>() }; current.questions += 1; if (row.subassunto?.trim()) current.subsubjects.add(row.subassunto.trim()); groups.set(key, current) }
  const subjects = Array.from(groups.values()).sort((a, b) => a.discipline.localeCompare(b.discipline, 'pt-BR') || a.subject.localeCompare(b.subject, 'pt-BR'))
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold">Assuntos</h1><p className="text-sm text-muted-foreground">{selectedDiscipline ? `Assuntos de ${selectedDiscipline}.` : 'Assuntos agrupados por disciplina.'}</p></div>{selectedDiscipline && <Link href="/admin/assuntos" className="inline-block rounded border px-3 py-2 text-sm hover:bg-accent">Mostrar todas as disciplinas</Link>}{error ? <p className="rounded border border-destructive p-4 text-destructive">Não foi possível carregar os assuntos.</p> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{subjects.map((item) => <Card key={`${item.discipline}-${item.subject}`}><CardHeader><p className="text-sm font-medium text-primary">{item.discipline}</p><CardTitle className="flex items-center gap-2 text-lg"><Layers3 className="h-5 w-5" />{item.subject}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p>{item.questions} questão(ões) · {item.subsubjects.size} subassunto(s)</p>{item.subsubjects.size > 0 && <p className="text-xs text-muted-foreground">{Array.from(item.subsubjects).join(' · ')}</p>}</CardContent></Card>)}</div>}</div>
}
