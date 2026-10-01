import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createEmbeddingRateLimitTelemetry,
  EmbeddingSlidingWindowRateLimiter,
  estimateEmbeddingBatchTokens,
  estimateEmbeddingInputTokens,
  splitEmbeddingBatchByTokenBudget,
  type EmbeddingRateLimitConfig,
} from './embedding-rate-limiter'
import { createGoogleEmbeddingClient, RagEmbeddingProviderError } from './embeddings'

const config = (rpmLimit: number, tpmLimit: number): EmbeddingRateLimitConfig => ({
  rpmLimit, tpmLimit, rpmUtilization: 1, tpmUtilization: 1, windowMs: 60_000, waitMarginMs: 1,
})

function fakeRuntime() {
  let time = 0
  const waits: number[] = []
  return { now: () => time, set: (value: number) => { time = value }, waits,
    sleep: async (delay: number) => { waits.push(delay); time += delay } }
}

test('estimador é finito, determinístico e conservador para textos variados', () => {
  for (const text of ['', 'abc', 'texto curto em português', 'ação pública 日本語', 'linha 1\nlinha 2', 'x'.repeat(10_000)]) {
    const first = estimateEmbeddingInputTokens(text)
    assert.equal(first, estimateEmbeddingInputTokens(text))
    assert.ok(Number.isFinite(first) && first >= 1)
  }
  assert.equal(estimateEmbeddingBatchTokens(['abc', 'def']), 2)
})

test('21000 tokens estimados permanecem abaixo do budget sem espera', async () => {
  const runtime = fakeRuntime()
  const telemetry = createEmbeddingRateLimitTelemetry()
  const limiter = new EmbeddingSlidingWindowRateLimiter(config(80, 24_000), telemetry, runtime.now, runtime.sleep)
  await limiter.acquire(8_000); await limiter.acquire(7_000); await limiter.acquire(6_000)
  assert.deepEqual(runtime.waits, [])
  assert.equal(telemetry.maxEstimatedTokensInWindow, 21_000)
})

test('batch que excederia TPM aguarda a janela deslizante', async () => {
  const runtime = fakeRuntime()
  const telemetry = createEmbeddingRateLimitTelemetry()
  const limiter = new EmbeddingSlidingWindowRateLimiter(config(80, 24_000), telemetry, runtime.now, runtime.sleep)
  await limiter.acquire(12_000); await limiter.acquire(10_000); await limiter.acquire(8_000)
  assert.deepEqual(runtime.waits, [60_001])
  assert.equal(telemetry.throttleWaitCount, 1)
})

test('evento com menos de 60s conta e evento com 60s sai da janela', async () => {
  const runtime = fakeRuntime()
  const telemetry = createEmbeddingRateLimitTelemetry()
  const limiter = new EmbeddingSlidingWindowRateLimiter(config(80, 10), telemetry, runtime.now, runtime.sleep)
  await limiter.acquire(10)
  runtime.set(59_999)
  await limiter.acquire(1)
  assert.deepEqual(runtime.waits, [2])
  runtime.set(120_001)
  await limiter.acquire(10)
  assert.equal(runtime.waits.length, 1)
})

test('proteção RPM aguarda quando o budget de requests é atingido', async () => {
  const runtime = fakeRuntime()
  const telemetry = createEmbeddingRateLimitTelemetry()
  const limiter = new EmbeddingSlidingWindowRateLimiter(config(2, 1000), telemetry, runtime.now, runtime.sleep)
  await limiter.acquire(1); await limiter.acquire(1); await limiter.acquire(1)
  assert.deepEqual(runtime.waits, [60_001])
})

test('subdivisão é determinística, mínima e preserva ordem', () => {
  const items = [{ id: 1, tokens: 600 }, { id: 2, tokens: 600 }, { id: 3, tokens: 300 }]
  const batches = splitEmbeddingBatchByTokenBudget(items, (item) => item.tokens, 1_000)
  assert.deepEqual(batches.map((batch) => batch.map((item) => item.id)), [[1], [2, 3]])
  assert.deepEqual(splitEmbeddingBatchByTokenBudget(items.slice(0, 2), (item) => item.tokens, 1_200).map((batch) => batch.length), [2])
})

test('retry conta novamente request e tokens sem mascarar resultado', async () => {
  const runtime = fakeRuntime()
  const telemetry = createEmbeddingRateLimitTelemetry()
  let calls = 0
  const client = createGoogleEmbeddingClient({ apiKey: 'test-key', telemetry, now: runtime.now, sleep: runtime.sleep,
    rateLimitConfig: config(80, 24_000), random: () => 0,
    fetchImpl: async () => ++calls === 1 ? new Response(null, { status: 429 })
      : Response.json({ embeddings: [{ values: Array(768).fill(0.1) }] }) })
  const result = await client.embed([{ content: 'consulta', taskType: 'RETRIEVAL_QUERY' }])
  assert.equal(result[0].values.length, 768)
  assert.equal(telemetry.httpAttempts, 2)
  assert.equal(telemetry.estimatedTokensTotal, 2 * estimateEmbeddingInputTokens('task: search result | query: consulta'))
})

test('sub-batches preservam ordem dos embeddings retornados', async () => {
  const runtime = fakeRuntime()
  const telemetry = createEmbeddingRateLimitTelemetry()
  let calls = 0
  const client = createGoogleEmbeddingClient({ apiKey: 'test-key', telemetry, now: runtime.now, sleep: runtime.sleep,
    rateLimitConfig: config(80, 1_000),
    fetchImpl: async (_input, init) => {
      calls += 1
      const body = JSON.parse(String(init?.body)) as { requests: unknown[] }
      return Response.json({ embeddings: body.requests.map(() => ({ values: Array(768).fill(calls) })) })
    } })
  const result = await client.embed([
    { content: 'a'.repeat(1_760), taskType: 'RETRIEVAL_DOCUMENT' },
    { content: 'b'.repeat(1_760), taskType: 'RETRIEVAL_DOCUMENT' },
  ])
  assert.equal(calls, 2)
  assert.equal(telemetry.subBatchesCreated, 1)
  assert.deepEqual(result.map((item) => item.values[0]), [1, 2])
})

test('429 final preserva RagEmbeddingProviderError e diagnostics', async () => {
  const runtime = fakeRuntime()
  const telemetry = createEmbeddingRateLimitTelemetry()
  const client = createGoogleEmbeddingClient({ apiKey: 'test-key', telemetry, now: runtime.now, sleep: runtime.sleep,
    rateLimitConfig: config(80, 24_000), random: () => 0,
    fetchImpl: async () => Response.json({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota exceeded' } }, { status: 429 }) })
  await assert.rejects(() => client.embed([{ content: 'x', taskType: 'RETRIEVAL_QUERY' }]), (error: unknown) => {
    assert.ok(error instanceof RagEmbeddingProviderError)
    assert.equal(error.diagnostics?.googleStatus, 'RESOURCE_EXHAUSTED')
    return true
  })
  assert.equal(telemetry.httpAttempts, 5)
})
