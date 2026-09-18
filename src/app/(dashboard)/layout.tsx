import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: administrator } = user
    ? await supabase.from('administradores').select('usuario_id').eq('usuario_id', user.id).maybeSingle()
    : { data: null }

  return (
    <div className="flex min-h-screen bg-background">
      <a href="#main-content" className="sr-only z-[100] rounded bg-background p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Pular para o conteúdo
      </a>
      <Sidebar isAdmin={Boolean(administrator)} />
      <main id="main-content" className="flex-1 min-w-0" tabIndex={-1}>
        <Header />
        <div className="p-4 md:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  )
}
