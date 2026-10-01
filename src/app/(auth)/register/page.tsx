'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { createClient } from '@/lib/supabase/client'

interface OnboardingContest {
  id: number
  nome: string
  orgao: string
  banca: string | null
  ano: number | null
  cargo: string | null
  especialidade: string | null
}

const registerSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres'),
  confirmPassword: z.string().min(6, 'Confirme sua senha'),
  concursoInicialId: z.string().regex(/^[1-9]\d*$/, 'Selecione um concurso'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
})

type RegisterFormData = z.infer<typeof registerSchema>

export default function RegisterPage() {
  const router = useRouter()
  const { register: registerUser, loading } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [contests, setContests] = useState<OnboardingContest[]>([])
  const [contestsLoading, setContestsLoading] = useState(true)
  const [contestsError, setContestsError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const loadContests = async () => {
      try {
        const { data, error: catalogError } = await createClient().rpc('listar_concursos_onboarding')
        if (!active) return
        if (catalogError) {
          setContestsError('Não foi possível carregar os concursos disponíveis.')
          return
        }
        setContests((data ?? []) as OnboardingContest[])
      } catch {
        if (active) setContestsError('Não foi possível carregar os concursos disponíveis.')
      } finally {
        if (active) setContestsLoading(false)
      }
    }
    void loadContests()
    return () => { active = false }
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  })

  const onSubmit = async (data: RegisterFormData) => {
    setIsSubmitting(true)
    setError(null)

    const result = await registerUser({
      email: data.email,
      password: data.password,
      nome: data.nome,
      concursoInicialId: Number(data.concursoInicialId),
    })

    if (result.success) {
      router.push('/dashboard')
    } else {
      setError(result.error || 'Erro ao fazer cadastro')
      setIsSubmitting(false)
    }
  }

  const isSupabaseConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL
    && !!(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Carregando...</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Cadastro</CardTitle>
          <CardDescription>
            Crie sua conta para começar a estudar
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            {!isSupabaseConfigured && (
              <Alert>
                <AlertDescription>
                  Supabase não está configurado. Configure a URL e a chave publicável para testar a autenticação.
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {contestsError && <Alert variant="destructive"><AlertDescription>{contestsError}</AlertDescription></Alert>}

            <div className="space-y-2">
              <Label htmlFor="concursoInicialId">Concurso que pretende estudar</Label>
              <select
                id="concursoInicialId"
                disabled={contestsLoading || Boolean(contestsError)}
                defaultValue=""
                {...register('concursoInicialId')}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">{contestsLoading ? 'Carregando concursos...' : 'Selecione um concurso'}</option>
                {contests.map((contest) => <option key={contest.id} value={contest.id}>{[contest.nome, contest.ano, contest.cargo, contest.especialidade].filter(Boolean).join(' — ')}</option>)}
              </select>
              {errors.concursoInicialId && <p className="text-sm text-destructive">{errors.concursoInicialId.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                type="text"
                placeholder="Seu nome"
                {...register('nome')}
              />
              {errors.nome && (
                <p className="text-sm text-destructive">{errors.nome.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register('password')}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || contestsLoading || Boolean(contestsError) || contests.length === 0 || !isSupabaseConfigured}
            >
              {isSubmitting ? 'Criando conta...' : 'Criar conta'}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              Já tem uma conta?{' '}
              <Link href="/login" className="text-primary hover:underline">
                Faça login
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
