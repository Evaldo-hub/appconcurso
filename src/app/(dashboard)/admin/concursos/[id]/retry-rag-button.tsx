'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import type { RetryRagResult } from '@/lib/rag/admin-retry-ingestion'

const initialState: RetryRagResult | null = null

export function RetryRagButton({
  materialId,
  action,
}: {
  materialId: number
  action: (state: RetryRagResult | null, formData: FormData) => Promise<RetryRagResult>
}) {
  const [state, formAction, pending] = useActionState(action, initialState)
  return <div className="space-y-2">
    <form action={formAction}>
      <input type="hidden" name="material_id" value={materialId} />
      <Button type="submit" disabled={pending}>{pending ? 'Tentando novamente...' : 'Tentar novamente'}</Button>
    </form>
    {state && <p role="status" className={`text-sm ${state.status === 'success' ? 'text-emerald-700' : state.status === 'quota' ? 'text-amber-700' : 'text-red-700'}`}>{state.message}</p>}
  </div>
}
