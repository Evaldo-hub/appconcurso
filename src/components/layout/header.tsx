'use client'

import { useAuth } from '@/hooks/useAuth'
import { useUIStore } from '@/stores/ui.store'
import { Button } from '@/components/ui/button'
import { LogOut, User, Menu, X } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { useRouter } from 'next/navigation'

export function Header() {
  const router = useRouter()
  const { user, logout } = useAuth()
  const { sidebarOpen, toggleSidebar } = useUIStore()

  const handleLogout = async () => {
    const result = await logout()
    if (result.success) {
      router.push('/login')
    }
  }

  return (
    <header className="border-b bg-card p-4 sticky top-0 z-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="lg:hidden"
            title="Menu"
            aria-label={sidebarOpen ? 'Fechar menu' : 'Abrir menu'}
          >
            {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
          <div>
            <h1 className="text-lg font-bold">Plataforma de Concursos</h1>
            <p className="text-sm text-muted-foreground hidden sm:block">
              Olá, {user?.user_metadata?.nome || user?.email || 'Usuário'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="flex items-center gap-2 text-sm hidden md:flex">
            <User className="h-4 w-4" />
            <span className="truncate max-w-[200px]">
              {user?.email}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            title="Sair"
            aria-label="Sair da conta"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  )
}
