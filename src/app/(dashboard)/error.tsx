'use client'

import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter()
  useEffect(() => {
    const safeMessage = error.message
      .replace(/authorization\s*:\s*bearer\s+\S+/gi, 'Authorization: Bearer [REDACTED]')
      .replace(/(?:AIza|ghp_|github_pat_|sb_secret_)[A-Za-z0-9_-]+/g, '[REDACTED]')
      .replace(/[\r\n\t]+/g, ' ')
      .slice(0, 500)
    console.error('[DASHBOARD_ERROR]', { errorName: error.name, errorMessage: safeMessage, digest: error.digest ?? null })
  }, [error])

  return (
    <section className="mx-auto max-w-xl rounded-lg border bg-card p-8 text-center" role="alert">
      <h2 className="text-xl font-semibold">Não foi possível carregar esta página</h2>
      <p className="mt-2 text-sm text-muted-foreground">Tente novamente. Se o problema continuar, volte ao painel.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Button onClick={reset}>Tentar novamente</Button>
        <Button variant="outline" onClick={() => router.push('/dashboard')}>Ir ao painel</Button>
      </div>
    </section>
  )
}
