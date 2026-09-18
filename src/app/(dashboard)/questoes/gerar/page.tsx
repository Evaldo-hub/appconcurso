import { createClient } from '@/lib/supabase/server'
import { GenerateQuestionsForm } from '@/components/questoes/generate-questions-form'

export const dynamic = 'force-dynamic'

export default async function GenerateQuestionsPage() {
  const supabase = await createClient()
  const [contests, exams, metadata] = await Promise.all([
    supabase.from('concursos').select('id, nome, ano').order('nome'),
    supabase.from('provas').select('id, concurso_id, nome').order('nome'),
    supabase.from('questoes_estudo').select('disciplina, assunto, banca').range(0, 4999),
  ])
  const error = contests.error || exams.error || metadata.error
  return <GenerateQuestionsForm contests={contests.data ?? []} exams={exams.data ?? []} metadata={metadata.data ?? []} catalogError={error ? 'Não foi possível carregar o catálogo.' : null} />
}
