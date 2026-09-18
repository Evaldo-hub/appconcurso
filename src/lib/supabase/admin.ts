import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { getPublicSupabaseEnv } from '@/lib/env'

export function createAdminClient() {
  const { url } = getPublicSupabaseEnv()
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!secretKey) throw new Error('Chave secreta do Supabase não configurada no servidor.')

  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
