import { createClient } from '@/lib/supabase/server'
import { StudyCatalog } from '@/components/estudar/study-catalog'

export const dynamic = 'force-dynamic'

export default async function EstudarPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('questoes_estudo')
    .select('id, concurso_id, disciplina, assunto, subassunto')
    .order('disciplina')
    .range(0, 4999)

  return <StudyCatalog questions={(data ?? []).map((item) => ({ ...item, id: String(item.id), concurso_id: item.concurso_id ? String(item.concurso_id) : null }))} error={error ? 'Não foi possível carregar o catálogo de estudo.' : null} />
}
