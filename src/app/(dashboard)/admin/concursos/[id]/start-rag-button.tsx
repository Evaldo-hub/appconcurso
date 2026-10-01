'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import type { StartRagIngestionResult } from '@/lib/rag/admin-start-ingestion'

const initialState: StartRagIngestionResult | null = null

export function StartRagButton({
  materialId,
  action,
}: {
  materialId: number
  action: (state: StartRagIngestionResult | null, formData: FormData) => Promise<StartRagIngestionResult>
}) {
  const [state, formAction, pending] = useActionState(action, initialState)
  return <div className="space-y-2">
    <form action={formAction}>
      <input type="hidden" name="material_id" value={materialId} />
      <Button type="submit" disabled={pending}>{pending ? 'Processando RAG...' : 'Iniciar RAG'}</Button>
    </form>
    {state && <p role="status" className={`text-sm ${state.status === 'success' ? 'text-emerald-700' : state.status === 'quota' ? 'text-amber-700' : 'text-red-700'}`}>{state.message}</p>}
  </div>
}
