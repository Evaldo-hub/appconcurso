import Link from 'next/link'
import { BookOpen, FileText, GraduationCap, LayoutDashboard, Layers3, Trophy, Users } from 'lucide-react'
import { requireAdmin } from '@/lib/supabase/require-admin'

const mainLinks = [
  { href: '/admin', label: 'Visão geral', icon: LayoutDashboard },
  { href: '/admin/questoes', label: 'Questões', icon: BookOpen },
  { href: '/admin/usuarios', label: 'Usuários', icon: Users },
]

const registrationLinks = [
  { href: '/admin/concursos', label: 'Concursos', icon: Trophy },
  { href: '/admin/provas', label: 'Provas', icon: FileText },
  { href: '/admin/disciplinas', label: 'Disciplinas', icon: GraduationCap },
  { href: '/admin/assuntos', label: 'Assuntos', icon: Layers3 },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()

  return (
    <div className="space-y-6">
      <nav aria-label="Administração" className="space-y-2 rounded-lg border bg-card p-2">
        <div className="flex flex-wrap gap-2">{mainLinks.map(({ href, label, icon: Icon }) => <AdminLink key={href} href={href} label={label} icon={Icon} />)}</div>
        <div className="border-t pt-2"><p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cadastros</p><div className="flex flex-wrap gap-2">{registrationLinks.map(({ href, label, icon: Icon }) => <AdminLink key={href} href={href} label={label} icon={Icon} />)}</div></div>
      </nav>
      {children}
    </div>
  )
}

function AdminLink({ href, label, icon: Icon }: { href: string; label: string; icon: typeof LayoutDashboard }) {
  return <Link href={href} className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"><Icon className="h-4 w-4" />{label}</Link>
}
