import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { ConcursoForm, ProvaForm } from '../ui'

export const dynamic = 'force-dynamic'

export default async function EditContestPage({ params, searchParams }: PageProps<'/admin/concursos/[id]'>) {
  const { id } = await params
  const query = await searchParams
  if (!/^\d+$/.test(id)) notFound()
  const admin = createAdminClient()
  const [{ data: contest }, { data: exams }] = await Promise.all([
    admin.from('concursos').select('id, nome, orgao, banca, ano, edital, cargo, especialidade, data_prova, descricao').eq('id', id).maybeSingle(),
    admin.from('provas').select('id, concurso_id, nome, cargo, especialidade, codigo_prova, turno').eq('concurso_id', id).order('nome'),
  ])
  if (!contest) notFound()
  return <div className="space-y-8"><ConcursoForm contest={contest} saved={query.salvo === '1'} error={typeof query.erro === 'string' ? query.erro : null} /><section className="space-y-4"><h2 className="text-xl font-bold">Provas</h2><ProvaForm contestId={String(contest.id)} />{(exams ?? []).map((exam) => <ProvaForm key={exam.id} contestId={String(contest.id)} exam={exam} />)}</section></div>
}
