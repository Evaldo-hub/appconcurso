/**
 * Script para testar conexão com Supabase
 * Execute: npx tsx src/lib/supabase/test-connection.ts
 */

import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

async function testConnection() {
  try {
    const { createClient } = await import('./client')
    const supabase = createClient()

    console.log('Testando conexão com Supabase...')
    console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL)

    // Teste simples de conexão
    const { data, error } = await supabase
      .from('concursos')
      .select('id, nome')
      .limit(1)

    if (error) {
      console.error('Erro na conexão:', error.message)
      return false
    }

    console.log('✅ Conexão com Supabase estabelecida com sucesso!')
    console.log('Registros encontrados no teste:', data?.length ?? 0)
    return true
  } catch (error) {
    console.error('Erro ao testar conexão:', error)
    return false
  }
}

testConnection()
