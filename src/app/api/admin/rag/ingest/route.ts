import { NextResponse } from 'next/server'
import { RAG_CONFIG, getRagServerConfig } from '@/lib/rag/config'
import { createGoogleEmbeddingClient } from '@/lib/rag/embeddings'
import { ingestMaterial, sanitizeIngestionError } from '@/lib/rag/ingest-material'
import { createPdfJsTextExtractor } from '@/lib/rag/pdf-extractor'
import { createSupabaseRagPersistence } from '@/lib/rag/persistence'
import { ragIngestionRequestSchema } from '@/lib/rag/request-schema'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/require-admin'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  await requireAdmin()

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }
  const parsed = ragIngestionRequestSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })

  try {
    const serverConfig = getRagServerConfig()
    const result = await ingestMaterial(parsed.data.material_id, {
      repository: serverConfig.repository,
      pdf: createPdfJsTextExtractor(),
      embeddings: createGoogleEmbeddingClient({ apiKey: serverConfig.geminiApiKey, timeoutMs: RAG_CONFIG.embedding.timeoutMs }),
      persistence: createSupabaseRagPersistence(createAdminClient()),
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: sanitizeIngestionError(error) }, { status: 500 })
  }
}
