import { ConcursoForm } from '../ui'

export default async function NewContestPage({ searchParams }: PageProps<'/admin/concursos/novo'>) {
  const query = await searchParams
  return <ConcursoForm contest={null} error={typeof query.erro === 'string' ? query.erro : null} />
}
