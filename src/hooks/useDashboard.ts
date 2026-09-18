'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { desempenhoService, type DashboardData } from '@/services/desempenho.service'

export function useDashboard() {
  const { user, loading: authLoading } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [requestVersion, setRequestVersion] = useState(0)

  const reload = useCallback(() => {
    setLoading(true)
    setRequestVersion((version) => version + 1)
  }, [])

  useEffect(() => {
    if (authLoading) return
    let active = true

    const request = user
      ? desempenhoService.getDashboard(user.id)
      : Promise.resolve(null)

    request
      .then((result) => {
        if (!active) return
        setData(result)
        setError(null)
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o Dashboard.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [authLoading, user, requestVersion])

  return { data, loading: loading || authLoading, error, reload }
}
