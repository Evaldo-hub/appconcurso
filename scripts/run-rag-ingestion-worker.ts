import { createAdminClient } from '../src/lib/supabase/admin-core'
import { RAG_CONFIG, getRagServerConfig } from '../src/lib/rag/config'
import { createGoogleEmbeddingClient } from '../src/lib/rag/embeddings'
import { ingestMaterial, reprocessMaterial, retryFailedMaterialIngestion } from '../src/lib/rag/ingest-material'
import { createPdfJsTextExtractor } from '../src/lib/rag/pdf-extractor'
import { createSupabaseRagPersistence } from '../src/lib/rag/persistence'
import { assertRagCliEnvironment } from './rag-cli-env'

type Mode = 'initial' | 'retry' | 'reprocess'

function argument(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const environmentStatuses = assertRagCliEnvironment()
  if (process.argv.includes('--check')) {
    for (const status of environmentStatuses) {
      console.log(`${status.label}: ${status.present ? 'present' : 'missing'}`)
    }
    console.log('RAG_CLI_BOOTSTRAP_OK')
    return
  }

  const mode = argument('--mode') as Mode | undefined
  const materialId = Number(argument('--material-id'))
  if (!mode || !['initial', 'retry', 'reprocess'].includes(mode) || !Number.isSafeInteger(materialId) || materialId < 1) {
    throw new Error('Uso: --mode initial|retry|reprocess --material-id <id>')
  }

  const admin = createAdminClient()
  const basePersistence = createSupabaseRagPersistence(admin)
  let reservedIngestionId: number | null = null
  let shuttingDown = false
  const persistence = new Proxy(basePersistence, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof value !== 'function') return value
      if (!['createIngestion', 'createFailedIngestionRetry', 'createReprocessingIngestion'].includes(String(property))) return value.bind(target)
      return async (...args: unknown[]) => {
        const id = await value.apply(target, args)
        reservedIngestionId = id as number
        return id
      }
    },
  })

  const terminate = (signal: 'SIGINT' | 'SIGTERM') => {
    if (shuttingDown) return
    shuttingDown = true
    void (async () => {
      if (reservedIngestionId !== null) {
        await persistence.failOrphanedIngestion(reservedIngestionId, 'ORPHANED_INGESTION_EXECUTOR_TERMINATED')
      }
      console.error(`${signal}: execução encerrada de forma controlada.`)
      process.exit(signal === 'SIGINT' ? 130 : 143)
    })().catch(() => process.exit(1))
  }
  process.once('SIGINT', () => terminate('SIGINT'))
  process.once('SIGTERM', () => terminate('SIGTERM'))

  const config = getRagServerConfig()
  const dependencies = {
    repository: config.repository,
    pdf: createPdfJsTextExtractor(),
    embeddings: createGoogleEmbeddingClient({ apiKey: config.geminiApiKey, timeoutMs: RAG_CONFIG.embedding.timeoutMs }),
    persistence,
  }
  const run = mode === 'initial' ? ingestMaterial : mode === 'retry' ? retryFailedMaterialIngestion : reprocessMaterial
  const result = await run(materialId, dependencies)
  console.log(JSON.stringify(result, null, 2))
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Falha inesperada no executor RAG.')
  process.exitCode = 1
})
