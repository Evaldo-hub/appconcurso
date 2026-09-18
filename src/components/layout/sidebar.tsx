'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui.store'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  History,
  TrendingUp,
  GraduationCap,
  Trophy,
  User,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Simulados', href: '/simulados', icon: FileText },
  { name: 'Revisões', href: '/revisoes', icon: History },
  { name: 'Desempenho', href: '/desempenho', icon: TrendingUp },
  { name: 'Estudar', href: '/estudar', icon: GraduationCap },
  { name: 'Concursos', href: '/concursos', icon: Trophy },
  { name: 'Perfil', href: '/perfil', icon: User },
]

const questionNavigation = [
  { name: 'Questões', href: '/questoes', icon: BookOpen },
  { name: 'Resolver Questões', href: '/questoes/resolver', icon: FileText },
  { name: 'Gerar Questões com IA', href: '/questoes/gerar', icon: GraduationCap },
]

export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname()
  const { sidebarOpen, sidebarCollapsed, toggleSidebarCollapsed, setSidebarOpen } = useUIStore()

  return (
    <>
      {/* Overlay para mobile */}
      {sidebarOpen && (
        <div
          role="button"
          aria-label="Fechar menu"
          tabIndex={0}
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          onKeyDown={(event) => event.key === 'Escape' && setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        aria-label="Menu principal"
        className={cn(
          'fixed left-0 top-0 z-50 h-screen border-r bg-card transition-all duration-300 lg:static lg:z-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          sidebarCollapsed ? 'w-16' : 'w-64'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Header da Sidebar */}
          <div className="flex items-center justify-between border-b p-4">
            {!sidebarCollapsed && (
              <h2 className="text-lg font-bold">Menu</h2>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebarCollapsed}
              className="hidden lg:flex"
              title={sidebarCollapsed ? 'Expandir' : 'Colapsar'}
              aria-label={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Navegação */}
          <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
            {!sidebarCollapsed && <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Banco de Questões</p>}
            {questionNavigation.map((item) => {
              const isActive = pathname === item.href
              return <Link key={item.name} href={item.href} className={cn('flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground', sidebarCollapsed && 'justify-center')} title={sidebarCollapsed ? item.name : undefined} aria-current={isActive ? 'page' : undefined} onClick={() => setSidebarOpen(false)}><item.icon className="h-4 w-4 flex-shrink-0" />{!sidebarCollapsed && <span>{item.name}</span>}</Link>
            })}
            <div className="my-2 border-t" />
            {[...navigation, ...(isAdmin ? [{ name: 'Administração', href: '/admin', icon: ShieldCheck }] : [])].map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    sidebarCollapsed && 'justify-center'
                  )}
                  title={sidebarCollapsed ? item.name : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  {!sidebarCollapsed && <span>{item.name}</span>}
                </Link>
              )
            })}
          </nav>
        </div>
      </aside>
    </>
  )
}
