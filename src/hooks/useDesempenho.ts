'use client'

import { useEffect, useState } from 'react'
import { desempenhoService, type PerformancePanel } from '@/services/desempenho.service'

export function useDesempenho() {
  const [data, setData] = useState<PerformancePanel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let active = true
    desempenhoService.getPerformancePanel()
      .then((panel) => { if (active) { setData(panel); setError(null) } })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o desempenho.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [version])

  const reload = () => { setLoading(true); setVersion((value) => value + 1) }
  return { data, loading, error, reload }
}
