export interface PublicSupabaseEnv {
  url: string
  anonKey: string
}

export function getPublicSupabaseEnv(): PublicSupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Configuração pública do Supabase ausente.')
  }

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') throw new Error()
  } catch {
    throw new Error('URL pública do Supabase inválida.')
  }

  return { url: url.replace(/\/$/, ''), anonKey }
}
