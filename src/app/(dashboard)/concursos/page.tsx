import { createClient } from '@/lib/supabase/server'
import { ConcursosList } from '@/components/concursos/concursos-list'

export const dynamic = 'force-dynamic'

export default async function ConcursosPage() {
  const supabase = await createClient()
  const [contestsResult, examsResult, questionsResult] = await Promise.all([
    supabase.from('concursos').select('id, nome, orgao, banca, ano, edital, cargo, especialidade, data_prova, descricao').order('ano', { ascending: false }),
    supabase.from('provas').select('id, concurso_id, nome, cargo, especialidade, codigo_prova, turno').order('nome'),
    supabase.from('questoes_estudo').select('id, concurso_id'),
  ])

  const error = contestsResult.error || examsResult.error || questionsResult.error
  const exams = examsResult.data ?? []
  const questions = questionsResult.data ?? []
  const contests = (contestsResult.data ?? []).map((contest) => ({
    ...contest,
    id: String(contest.id),
    provas: exams.filter((exam) => String(exam.concurso_id) === String(contest.id)).map((exam) => ({ ...exam, id: String(exam.id) })),
    quantidadeQuestoes: questions.filter((question) => String(question.concurso_id) === String(contest.id)).length,
  }))

  return <ConcursosList contests={contests} error={error ? 'Não foi possível carregar os concursos. Confirme a migration de acesso ao catálogo.' : null} />
}
