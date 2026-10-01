import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmbeddingRateLimitTelemetry } from './embedding-rate-limiter'
import { classifyEmbeddingProviderError, createGoogleEmbeddingClient, isDailyEmbeddingQuotaExhausted, RagEmbeddingProviderError } from './embeddings'
import { ingestMaterial, RagIngestionError } from './ingest-material'
import type { RagPersistence } from './persistence'

const request = [{ content: 'probe', taskType: 'RETRIEVAL_QUERY' as const }]
const success = (count = 1) => Response.json({ embeddings: Array.from({ length: count }, () => ({ values: Array(768).fill(0.25) })) })
function quota429(quotaMetric: string, quotaId: string, retryDelay = '41s') {
  return Response.json({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota exhausted', details: [
    { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaMetric, quotaId, quotaDimensions: { location: 'global', model: 'gemini-embedding-2' } }] },
    { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay },
  ] } }, { status: 429 })
}
const dailyMetric = 'generativelanguage.googleapis.com/embed_content_free_tier_requests'
const dailyId = 'EmbedContentRequestsPerDayPerUserPerProjectPerModel-FreeTier'

test('daily quota aborts after one HTTP attempt without sleep and preserves diagnostics', async () => {
  let calls = 0; let sleeps = 0
  const telemetry = createEmbeddingRateLimitTelemetry()
  const client = createGoogleEmbeddingClient({ apiKey: 'test-key', telemetry, fetchImpl: async () => { calls += 1; return quota429(dailyMetric, dailyId) }, sleep: async () => { sleeps += 1 } })
  await assert.rejects(client.embed(request), (error: unknown) => {
    assert.ok(error instanceof RagEmbeddingProviderError)
    assert.equal(isDailyEmbeddingQuotaExhausted(error), true)
    assert.equal(classifyEmbeddingProviderError(error), 'DAILY_QUOTA_EXHAUSTED')
    assert.equal(error.diagnostics?.retryDelay, '41s')
    assert.equal(error.diagnostics?.quotaViolations?.[0].quotaMetric, dailyMetric)
    assert.equal(error.diagnostics?.quotaViolations?.[0].quotaId, dailyId)
    return true
  })
  assert.equal(calls, 1); assert.equal(sleeps, 0); assert.equal(telemetry.httpAttempts, 1)
})

for (const [name, metric, id] of [
  ['generic', '', ''],
  ['RPM', 'generativelanguage.googleapis.com/embed_content_requests', 'EmbedContentRequestsPerMinutePerProjectPerModel'],
  ['TPM', 'generativelanguage.googleapis.com/embed_content_input_tokens', 'EmbedContentInputTokensPerMinutePerModel'],
] as const) {
  test(`429 ${name} remains retryable and succeeds`, async () => {
    let calls = 0; let sleeps = 0
    const client = createGoogleEmbeddingClient({ apiKey: 'test-key', fetchImpl: async () => ++calls === 1 ? quota429(metric, id) : success(), sleep: async () => { sleeps += 1 } })
    const result = await client.embed(request)
    assert.equal(result.length, 1); assert.equal(calls, 2); assert.equal(sleeps, 1)
  })
}

test('503 retries normally and 400 never retries', async () => {
  let calls503 = 0
  const retrying = createGoogleEmbeddingClient({ apiKey: 'test-key', fetchImpl: async () => ++calls503 === 1 ? new Response(null, { status: 503 }) : success(), sleep: async () => {} })
  assert.equal((await retrying.embed(request)).length, 1); assert.equal(calls503, 2)
  let calls400 = 0; let sleeps400 = 0
  const permanent = createGoogleEmbeddingClient({ apiKey: 'test-key', fetchImpl: async () => { calls400 += 1; return new Response(null, { status: 400 }) }, sleep: async () => { sleeps400 += 1 } })
  await assert.rejects(permanent.embed(request)); assert.equal(calls400, 1); assert.equal(sleeps400, 0)
})

function ingestionHarness(sectionCount: number, embeddingFetch: typeof fetch) {
  const state = { created: 0, inserted: 0, activated: 0, failed: 0, totalChunks: -1, embeddingAttempts: 0 }
  const persistence: RagPersistence = {
    async findMaterial() { return { id: 8, concursoId: 7, provaId: null, titulo: 'Constituicao', githubPath: 'docs/material.pdf', tipoArquivo: 'pdf', arquivoOrigem: 'material.pdf', disciplina: null, assunto: null, subassunto: null, ativo: true } },
    async createIngestion() { state.created += 1; return 17 },
    async createFailedIngestionRetry() { throw new Error('retry não esperado') },
    async createReprocessingIngestion() { state.created += 1; return 18 },
    async insertDocuments(documents) { state.inserted += documents.length },
    async setTotalChunks(_id, chunks) { state.totalChunks = chunks },
    async countDocuments() { return state.inserted },
    async activateIngestion() { state.activated += 1 },
    async markIngestionFailed() { state.failed += 1; state.totalChunks = 0 },
    async failOrphanedIngestion() { throw new Error('orphan recovery não esperado') },
  }
  const embeddings = createGoogleEmbeddingClient({ apiKey: 'test-key', fetchImpl: async (input, init) => { state.embeddingAttempts += 1; return embeddingFetch(input, init) }, sleep: async () => { assert.fail('daily quota must not sleep') } })
  const run = () => ingestMaterial(8, {
    repository: { owner: 'owner', repository: 'repo', ref: 'main' },
    fetchImpl: async () => new Response(new Uint8Array([1, 2, 3])),
    pdf: {
      async extract() {
        return {
          sections: Array.from({ length: sectionCount }, (_, index) => ({
            content: `Art. ${index + 1} conteudo juridico unico ${index}.`,
            page: index + 1,
            title: null,
            section: null,
          })),
        }
      },
    },
    embeddings,
    persistence,
  })
  return { state, run }
}

test('ingestion with 395 chunks and daily quota persists no documents and never activates', async () => {
  const harness = ingestionHarness(395, async () => quota429(dailyMetric, dailyId))
  await assert.rejects(harness.run(), (error: unknown) => {
    assert.ok(error instanceof RagIngestionError)
    assert.equal(error.classification, 'DAILY_QUOTA_EXHAUSTED')
    assert.equal(error.message, 'DAILY_QUOTA_EXHAUSTED')
    return true
  })
  assert.deepEqual(harness.state, { created: 1, inserted: 0, activated: 0, failed: 1, totalChunks: 0, embeddingAttempts: 1 })
})

test('later daily quota discards earlier in-memory embeddings atomically', async () => {
  let batch = 0
  const harness = ingestionHarness(40, async (_input, init) => {
    batch += 1
    const body = JSON.parse(String(init?.body)) as { requests: unknown[] }
    return batch === 1 ? success(body.requests.length) : quota429(dailyMetric, dailyId)
  })
  await assert.rejects(harness.run(), /DAILY_QUOTA_EXHAUSTED/)
  assert.equal(harness.state.embeddingAttempts, 2)
  assert.equal(harness.state.inserted, 0)
  assert.equal(harness.state.activated, 0)
  assert.equal(harness.state.failed, 1)
  assert.equal(harness.state.totalChunks, 0)
})
