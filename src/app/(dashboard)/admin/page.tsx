import Link from 'next/link'
import { ShieldCheck, Users, BookOpen, FileText, Database } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const managedTables = [
  'concursos', 'provas', 'questoes_estudo', 'documents', 'simulados',
  'respostas_simulado', 'respostas_questoes', 'sessoes_revisao',
  'conversas_estudo_ia', 'telegram_vinculos',
] as const

export default async function AdminPage() {
  const admin = createAdminClient()
  const [tableResults, usersResult, questionsResult, simulationsResult, answersResult] = await Promise.all([
    Promise.all(managedTables.map(async (table) => {
      const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true })
      return { table, count: error ? null : count, error: Boolean(error) }
    })),
    admin.auth.admin.listUsers({ page: 1, perPage: 50 }),
    admin.from('questoes_estudo').select('id, disciplina, assunto, enunciado, gabarito').order('id', { ascending: false }).limit(20),
    admin.from('simulados').select('id, usuario_id, status, quantidade_questoes, acertos, erros, data_criacao').order('data_criacao', { ascending: false }).limit(20),
    admin.from('respostas_questoes').select('id, usuario_id, questao_id, correta, created_at').order('created_at', { ascending: false }).limit(20),
  ])

  const countFor = (table: typeof managedTables[number]) => tableResults.find((item) => item.table === table)?.count ?? 0
  const users = usersResult.data?.users ?? []
  const totalUsers = usersResult.data && 'total' in usersResult.data ? usersResult.data.total : users.length
  const questions = questionsResult.data ?? []
  const simulations = simulationsResult.data ?? []
  const answers = answersResult.data ?? []

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2"><ShieldCheck className="h-7 w-7 text-primary" /><h1 className="text-3xl font-bold">Administração</h1></div>
        <p className="mt-1 text-muted-foreground">Visão global protegida da plataforma.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Usuários" value={totalUsers} icon={Users} />
        <Metric title="Questões" value={countFor('questoes_estudo')} icon={BookOpen} />
        <Metric title="Simulados" value={countFor('simulados')} icon={FileText} />
        <Metric title="Documentos RAG" value={countFor('documents')} icon={Database} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/admin/questoes" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Consultar todas as questões</Link>
        <Link href="/admin/usuarios" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">Consultar usuários</Link>
      </div>

      <Card>
        <CardHeader><CardTitle>Contagem por tabela</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tableResults.map((item) => <div key={item.table} className="flex justify-between rounded-md border p-3 text-sm"><code>{item.table}</code><strong>{item.error ? 'Indisponível' : item.count}</strong></div>)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Usuários recentes</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">E-mail</th><th className="p-2">Criado em</th><th className="p-2">Último acesso</th></tr></thead><tbody>
            {users.map((item) => <tr key={item.id} className="border-b"><td className="p-2">{item.email ?? 'Sem e-mail'}</td><td className="p-2">{formatDate(item.created_at)}</td><td className="p-2">{formatDate(item.last_sign_in_at)}</td></tr>)}
          </tbody></table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Questões recentes e gabaritos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {questions.map((item) => <div key={item.id} className="rounded-md border p-3"><div className="flex justify-between gap-4 text-sm font-medium"><span>#{item.id} · {item.disciplina} · {item.assunto}</span><span className="rounded bg-primary px-2 py-0.5 text-primary-foreground">{item.gabarito ?? '—'}</span></div><p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.enunciado}</p></div>)}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Simulados recentes</CardTitle></CardHeader><CardContent className="space-y-2">{simulations.map((item) => <div key={item.id} className="rounded border p-3 text-sm"><strong>#{item.id} · {item.status}</strong><p className="text-muted-foreground">Usuário: {item.usuario_id} · {item.quantidade_questoes} questões · {item.acertos ?? 0} acertos · {item.erros ?? 0} erros</p></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Respostas recentes</CardTitle></CardHeader><CardContent className="space-y-2">{answers.map((item) => <div key={item.id} className="rounded border p-3 text-sm"><strong>Questão #{item.questao_id} · {item.correta ? 'Acerto' : 'Erro'}</strong><p className="text-muted-foreground">Usuário: {item.usuario_id} · {formatDate(item.created_at)}</p></div>)}</CardContent></Card>
      </div>
    </div>
  )
}

function Metric({ title, value, icon: Icon }: { title: string; value: number; icon: typeof Users }) {
  return <Card><CardContent className="flex items-center justify-between p-6"><div><p className="text-sm text-muted-foreground">{title}</p><p className="text-3xl font-bold">{value}</p></div><Icon className="h-8 w-8 text-primary" /></CardContent></Card>
}

function formatDate(value?: string | null) {
  return value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—'
}
