'use client'

import { Moon, Sun } from 'lucide-react'
import { useUIStore } from '@/stores/ui.store'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const { theme, setTheme } = useUIStore()

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light')
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      title={theme === 'light' ? 'Mudar para tema escuro' : 'Mudar para tema claro'}
    >
      {theme === 'light' ? (
        <Moon className="h-4 w-4" />
      ) : (
        <Sun className="h-4 w-4" />
      )}
    </Button>
  )
}
