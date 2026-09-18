import { createClient } from '@/lib/supabase/client'
import { AuthError, Session, User } from '@supabase/supabase-js'

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterCredentials {
  email: string
  password: string
  nome?: string
}

export interface ResetPasswordCredentials {
  email: string
}

export interface UpdatePasswordCredentials {
  password: string
}

const isSupabaseConfigured = () => Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL
  && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
)

class AuthService {
  private supabase = createClient()

  async login(credentials: LoginCredentials) {
    // Verificar se Supabase está configurado
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase não está configurado. Configure as variáveis de ambiente.')
    }

    const { data, error } = await this.supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    })

    if (error) {
      throw this.handleError(error)
    }

    return data
  }

  async register(credentials: RegisterCredentials) {
    // Verificar se Supabase está configurado
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase não está configurado. Configure as variáveis de ambiente.')
    }

    const { data, error } = await this.supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        data: {
          nome: credentials.nome,
        },
      },
    })

    if (error) {
      throw this.handleError(error)
    }

    return data
  }

  async logout() {
    // Verificar se Supabase está configurado
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase não está configurado. Configure as variáveis de ambiente.')
    }

    const { error } = await this.supabase.auth.signOut()

    if (error) {
      throw this.handleError(error)
    }
  }

  async resetPassword(credentials: ResetPasswordCredentials) {
    // Verificar se Supabase está configurado
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase não está configurado. Configure as variáveis de ambiente.')
    }

    const { error } = await this.supabase.auth.resetPasswordForEmail(
      credentials.email,
      {
        redirectTo: `${window.location.origin}/reset-password`,
      }
    )

    if (error) {
      throw this.handleError(error)
    }
  }

  async updatePassword(credentials: UpdatePasswordCredentials) {
    // Verificar se Supabase está configurado
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase não está configurado. Configure as variáveis de ambiente.')
    }

    const { error } = await this.supabase.auth.updateUser({
      password: credentials.password,
    })

    if (error) {
      throw this.handleError(error)
    }
  }

  async getCurrentUser(): Promise<User | null> {
    // Verificar se Supabase está configurado
    if (!isSupabaseConfigured()) {
      return null
    }

    const { data: { user }, error } = await this.supabase.auth.getUser()

    if (error) {
      if (error.name === 'AuthSessionMissingError' || error.message === 'Auth session missing!') {
        return null
      }
      throw this.handleError(error)
    }

    return user
  }

  async getSession() {
    // Verificar se Supabase está configurado
    if (!isSupabaseConfigured()) {
      return null
    }

    const { data: { session }, error } = await this.supabase.auth.getSession()

    if (error) {
      throw this.handleError(error)
    }

    return session
  }

  onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    // Verificar se Supabase está configurado
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return { data: { subscription: { unsubscribe: () => {} } } }
    }

    return this.supabase.auth.onAuthStateChange(callback)
  }

  private handleError(error: AuthError): Error {
    // Mapear erros do Supabase para mensagens mais amigáveis
    const errorMessages: Record<string, string> = {
      'Invalid login credentials': 'Email ou senha inválidos',
      'Email not confirmed': 'Email não confirmado. Verifique sua caixa de entrada.',
      'User already registered': 'Este email já está cadastrado',
      'Password should be at least 6 characters': 'A senha deve ter pelo menos 6 caracteres',
      'Unable to validate email address': 'Endereço de email inválido',
    }

    const message = errorMessages[error.message] || error.message

    return new Error(message)
  }
}

export const authService = new AuthService()
