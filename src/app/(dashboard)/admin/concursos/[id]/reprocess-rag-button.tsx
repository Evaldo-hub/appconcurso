'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import type { ReprocessRagResult } from '@/lib/rag/admin-reprocess-ingestion'

const initialState: ReprocessRagResult | null = null

export function ReprocessRagButton({
  materialId,
  action,
  disabled = false,
}: {
  materialId: number
  action: (state: ReprocessRagResult | null, formData: FormData) => Promise<ReprocessRagResult>
  disabled?: boolean
}) {
  const [state, formAction, pending] = useActionState(action, initialState)
  return <div className="space-y-2">
    <form action={formAction}>
      <input type="hidden" name="material_id" value={materialId} />
      <Button type="submit" disabled={disabled || pending}>{pending ? 'Reprocessando RAG...' : 'Reprocessar RAG'}</Button>
    </form>
    {state && <p role="status" className={`text-sm ${state.status === 'success' ? 'text-emerald-700' : state.status === 'quota' ? 'text-amber-700' : 'text-red-700'}`}>{state.message}</p>}
  </div>
}
