import Link from 'next/link'
import { Search } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { defineStudentAccessAction } from './actions'

export const dynamic = 'force-dynamic'
const pageSize = 25

export default async function AdminUsersPage({ searchParams }: PageProps<'/admin/usuarios'>) {
  const params = await searchParams
  const term = typeof params.q === 'string' ? params.q.trim().toLocaleLowerCase('pt-BR').slice(0, 100) : ''
  const currentPage = Math.max(1, Number(typeof params.pagina === 'string' ? params.pagina : 1) || 1)
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.listUsers({ page: currentPage, perPage: pageSize })
  const { data: accesses } = await admin.from('acessos_estudante').select('usuario_id, status, expira_em')
  const users = (data?.users ?? []).filter((user) => !term || user.email?.toLocaleLowerCase('pt-BR').includes(term) || String(user.user_metadata?.nome ?? '').toLocaleLowerCase('pt-BR').includes(term))
  const total = data && 'total' in data ? data.total : users.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pageHref = (page: number) => `/admin/usuarios?pagina=${page}${term ? `&q=${encodeURIComponent(term)}` : ''}`

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Usuários</h1><p className="text-sm text-muted-foreground">Contas cadastradas no Supabase Auth.</p></div>
      <form className="flex max-w-2xl gap-2" action="/admin/usuarios">
        <Input name="q" defaultValue={term} placeholder="Buscar por e-mail ou nome nesta página" maxLength={100} />
        <Button type="submit"><Search />Buscar</Button>
      </form>

      {params.salvo === '1' && <Alert>Acesso atualizado com sucesso.</Alert>}{params.erro && <Alert variant="destructive">Não foi possível atualizar. Confirme a migration de controle de acesso.</Alert>}
      <Card><CardHeader><CardTitle>{total} usuários cadastrados</CardTitle></CardHeader><CardContent className="overflow-x-auto">
        {error ? <p className="text-destructive">Não foi possível consultar os usuários.</p> : (
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead><tr className="border-b"><th className="p-3">Nome / E-mail</th><th className="p-3">Acesso</th><th className="p-3">Criado em</th><th className="p-3">Renovar ou bloquear</th></tr></thead>
            <tbody>{users.map((user) => {const access=accesses?.find((item)=>item.usuario_id===user.id);return <tr key={user.id} className="border-b"><td className="p-3"><p>{String(user.user_metadata?.nome ?? '—')}</p><p className="text-xs text-muted-foreground">{user.email ?? '—'}</p></td><td className="p-3"><p className={access?.status==='ativo'&&new Date(access.expira_em)>new Date()?'text-green-600':'text-destructive'}>{access?.status==='ativo'&&new Date(access.expira_em)>new Date()?'Ativo':'Expirado/Bloqueado'}</p><p className="text-xs text-muted-foreground">Até {formatDate(access?.expira_em)}</p></td><td className="p-3">{formatDate(user.created_at)}</td><td className="p-3"><form action={defineStudentAccessAction} className="flex flex-wrap gap-2"><input type="hidden" name="usuario_id" value={user.id}/><select name="dias" defaultValue="30" className="h-8 rounded border bg-background px-2"><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option><option value="365">1 ano</option></select><Button name="status" value="ativo" size="sm">Liberar</Button><Button name="status" value="bloqueado" size="sm" variant="destructive">Bloquear</Button></form></td></tr>})}</tbody>
          </table>
        )}
      </CardContent></Card>

      <div className="flex items-center justify-between">
        {currentPage > 1 ? <Link className="rounded border px-3 py-2 text-sm" href={pageHref(currentPage - 1)}>Anterior</Link> : <span />}
        <span className="text-sm text-muted-foreground">Página {currentPage} de {totalPages}</span>
        {currentPage < totalPages ? <Link className="rounded border px-3 py-2 text-sm" href={pageHref(currentPage + 1)}>Próxima</Link> : <span />}
      </div>
    </div>
  )
}

function formatDate(value?: string | null) {
  return value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—'
}
