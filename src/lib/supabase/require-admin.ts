import 'server-only'

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: administrator } = await supabase
    .from('administradores')
    .select('usuario_id')
    .eq('usuario_id', user.id)
    .maybeSingle()

  if (!administrator) notFound()
  return user
}
