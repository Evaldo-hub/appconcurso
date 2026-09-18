import Link from 'next/link'
import { GraduationCap } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default async function AdminDisciplinesPage() {
  const admin = createAdminClient()
  const { data, error } = await admin.from('questoes_estudo').select('disciplina, assunto').range(0, 9999)
  const groups = new Map<string, { questions: number; subjects: Set<string> }>()
  for (const row of data ?? []) { const name = row.disciplina?.trim(); if (!name) continue; const current = groups.get(name) ?? { questions: 0, subjects: new Set<string>() }; current.questions += 1; if (row.assunto?.trim()) current.subjects.add(row.assunto.trim()); groups.set(name, current) }
  const disciplines = Array.from(groups, ([name, values]) => ({ name, questions: values.questions, subjects: values.subjects.size })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold">Disciplinas</h1><p className="text-sm text-muted-foreground">Catálogo consolidado a partir das questões existentes.</p></div>{error ? <p className="rounded border border-destructive p-4 text-destructive">Não foi possível carregar as disciplinas.</p> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{disciplines.map((item) => <Card key={item.name}><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><GraduationCap className="h-5 w-5 text-primary" />{item.name}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p>{item.subjects} assunto(s) · {item.questions} questão(ões)</p><Link href={`/admin/assuntos?disciplina=${encodeURIComponent(item.name)}`} className="inline-block rounded border px-3 py-2 hover:bg-accent">Ver assuntos</Link></CardContent></Card>)}</div>}</div>
}
