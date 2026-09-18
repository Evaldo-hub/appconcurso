import Link from 'next/link'
import { FileText } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

interface ContestRelation { id: number; nome: string; ano: number | null }
const first = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value

export default async function AdminExamsPage() {
  const admin = createAdminClient()
  const { data, error } = await admin.from('provas').select('id, concurso_id, nome, cargo, especialidade, codigo_prova, turno, concursos(id, nome, ano)').order('nome')
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold">Provas</h1><p className="text-sm text-muted-foreground">Provas cadastradas e vinculadas aos concursos.</p></div>
    {error ? <p className="rounded border border-destructive p-4 text-destructive">Não foi possível carregar as provas.</p> : <div className="grid gap-4 md:grid-cols-2">{(data ?? []).map((exam) => { const contest = first(exam.concursos as ContestRelation | ContestRelation[] | null); return <Card key={exam.id}><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileText className="h-5 w-5 text-primary" />{exam.nome}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p className="font-medium">{contest?.nome ?? 'Concurso não informado'}{contest?.ano ? ` · ${contest.ano}` : ''}</p><p className="text-muted-foreground">{[exam.codigo_prova, exam.cargo, exam.especialidade, exam.turno].filter(Boolean).join(' · ') || 'Sem detalhes adicionais'}</p>{contest && <Link href={`/admin/concursos/${contest.id}`} className="inline-block rounded border px-3 py-2 hover:bg-accent">Editar no concurso</Link>}</CardContent></Card> })}</div>}
  </div>
}
