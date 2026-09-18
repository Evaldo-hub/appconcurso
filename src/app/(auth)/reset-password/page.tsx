'use client'

import { useState } from 'react'
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

const resetPasswordSchema = z.object({
  email: z.string().email('Email inválido'),
})

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>

export default function ResetPasswordPage() {
  const router = useRouter()
  const { resetPassword } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  })

  const onSubmit = async (data: ResetPasswordFormData) => {
    setIsSubmitting(true)
    setError(null)

    const result = await resetPassword(data.email)

    if (result.success) {
      setSuccess(true)
    } else {
      setError(result.error || 'Erro ao enviar email de recuperação')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Recuperação de Senha</CardTitle>
          <CardDescription>
            {success
              ? 'Email de recuperação enviado com sucesso!'
              : 'Digite seu email para receber instruções de recuperação'
            }
          </CardDescription>
        </CardHeader>
        {!success ? (
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

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
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Enviando...' : 'Enviar email de recuperação'}
              </Button>
              <p className="text-sm text-center text-muted-foreground">
                Lembrou sua senha?{' '}
                <Link href="/login" className="text-primary hover:underline">
                  Faça login
                </Link>
              </p>
            </CardFooter>
          </form>
        ) : (
          <CardContent className="space-y-4">
            <Alert>
              <AlertDescription>
                Enviamos um email com instruções para recuperar sua senha. Verifique sua caixa de entrada.
              </AlertDescription>
            </Alert>
            <CardFooter className="flex flex-col space-y-4">
              <Button
                onClick={() => router.push('/login')}
                className="w-full"
              >
                Voltar ao login
              </Button>
            </CardFooter>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
