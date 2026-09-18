import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import { authService, type LoginCredentials, type RegisterCredentials } from '@/services/auth.service'

export function useAuth() {
  const [loading, setLoading] = useState(true)
  const { user, isAuthenticated, setUser, logout } = useAuthStore()

  const checkAuth = useCallback(async () => {
    try {
      setUser(await authService.getCurrentUser())
    } catch (error) {
      console.error('Erro ao verificar autenticação:', error)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [setUser])

  useEffect(() => {
    void checkAuth()
    const { data: { subscription } } = authService.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [checkAuth, setUser])

  const login = async (credentials: LoginCredentials) => {
    try {
      const data = await authService.login(credentials)
      setUser(data.user)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erro ao fazer login' }
    }
  }

  const register = async (credentials: RegisterCredentials) => {
    try {
      const data = await authService.register(credentials)
      setUser(data.user)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erro ao fazer cadastro' }
    }
  }

  const handleLogout = async () => {
    try {
      await authService.logout()
      logout()
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erro ao fazer logout' }
    }
  }

  const resetPassword = async (email: string) => {
    try {
      await authService.resetPassword({ email })
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erro ao enviar email de recuperação' }
    }
  }

  return { user, isAuthenticated, loading, login, register, logout: handleLogout, resetPassword, checkAuth }
}
