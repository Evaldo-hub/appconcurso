'use client'

import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter()

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
