import Link from 'next/link'
import { Search } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'
const pageSize = 20

export default async function AdminQuestionsPage({ searchParams }: PageProps<'/admin/questoes'>) {
  const params = await searchParams
  const term = typeof params.q === 'string' ? params.q.trim().slice(0, 100) : ''
  const currentPage = Math.max(1, Number(typeof params.pagina === 'string' ? params.pagina : 1) || 1)
  const from = (currentPage - 1) * pageSize
  const admin = createAdminClient()

  let query = admin
    .from('questoes_estudo')
    .select('id, disciplina, assunto, subassunto, banca, dificuldade, enunciado, gabarito', { count: 'exact' })
    .order('id', { ascending: false })
    .range(from, from + pageSize - 1)
  if (term) query = query.ilike('enunciado', `%${term.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`)

  const { data: questions, count, error } = await query
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize))
  const pageHref = (page: number) => `/admin/questoes?pagina=${page}${term ? `&q=${encodeURIComponent(term)}` : ''}`

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Questões</h1><p className="text-sm text-muted-foreground">Consulta administrativa com acesso ao gabarito.</p></div>
      <form className="flex max-w-2xl gap-2" action="/admin/questoes">
        <Input name="q" defaultValue={term} placeholder="Buscar no enunciado" maxLength={100} />
        <Button type="submit"><Search />Buscar</Button>
      </form>

      {error ? <p className="rounded-md border border-destructive p-4 text-destructive">Não foi possível consultar as questões.</p> : (
        <Card><CardHeader><CardTitle>{count ?? 0} questões encontradas</CardTitle></CardHeader><CardContent className="space-y-3">
          {(questions ?? []).map((question) => (
            <article key={question.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <strong>#{question.id} · {question.disciplina || 'Sem disciplina'} · {question.assunto || 'Sem assunto'}</strong>
                <span className="rounded bg-primary px-2 py-1 font-semibold text-primary-foreground">Gabarito: {question.gabarito || '—'}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{question.enunciado}</p>
              <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{[question.banca, question.dificuldade, question.subassunto].filter(Boolean).join(' · ')}</p><Link href={`/admin/questoes/${question.id}`} className="rounded border px-3 py-1.5 text-sm hover:bg-accent">Editar</Link></div>
            </article>
          ))}
          {!questions?.length && <p className="py-8 text-center text-muted-foreground">Nenhuma questão encontrada.</p>}
        </CardContent></Card>
      )}

      <div className="flex items-center justify-between">
        {currentPage > 1 ? <Link className="rounded border px-3 py-2 text-sm" href={pageHref(currentPage - 1)}>Anterior</Link> : <span />}
        <span className="text-sm text-muted-foreground">Página {currentPage} de {totalPages}</span>
        {currentPage < totalPages ? <Link className="rounded border px-3 py-2 text-sm" href={pageHref(currentPage + 1)}>Próxima</Link> : <span />}
      </div>
    </div>
  )
}
