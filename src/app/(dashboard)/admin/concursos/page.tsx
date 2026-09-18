import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default async function AdminConcursosPage() {
  const admin = createAdminClient()
  const { data: contests, error } = await admin.from('concursos').select('id, nome, orgao, banca, ano, cargo, especialidade, provas(id)').order('ano', { ascending: false })
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Concursos e provas</h1><p className="text-sm text-muted-foreground">Cadastre e mantenha o catálogo institucional.</p></div><Link href="/admin/concursos/novo" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4" />Novo concurso</Link></div>
    {error ? <p className="rounded border border-destructive p-4 text-destructive">Não foi possível consultar os concursos.</p> : <div className="grid gap-4 md:grid-cols-2">{(contests ?? []).map((contest) => <Card key={contest.id}><CardHeader><CardTitle>{contest.nome}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p>{contest.orgao}{contest.ano ? ` · ${contest.ano}` : ''}</p><p className="text-muted-foreground">{[contest.banca, contest.cargo, contest.especialidade].filter(Boolean).join(' · ') || 'Sem detalhes adicionais'}</p><p>{contest.provas?.length ?? 0} prova(s)</p><Link href={`/admin/concursos/${contest.id}`} className="inline-block rounded border px-3 py-2 hover:bg-accent">Gerenciar</Link></CardContent></Card>)}</div>}
  </div>
}
