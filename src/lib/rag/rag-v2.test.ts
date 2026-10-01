import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { chunkExtractedDocument } from './chunk-text'
import { createGoogleEmbeddingClient, RagEmbeddingProviderError, validateRagEmbedding } from './embeddings'
import { hashRagContent } from './hash-content'
import { finalizeChunks } from './ingest-material'
import { normalizeRagText } from './normalize-text'
import { ragIngestionRequestSchema } from './request-schema'

test('normalização preserva estrutura jurídica relevante', () => {
  const normalized = normalizeRagText('Art. 1º\r\n\r\n§ 1º  Texto   legal\r\nI - item')
  assert.equal(normalized, 'Art. 1º\n\n§ 1º  Texto   legal\nI - item')
})

test('chunking respeita o limite máximo configurado', () => {
  const content = Array.from({ length: 600 }, (_, index) => `Art. ${index + 1} Texto normativo completo.`).join('\n\n')
  const chunks = chunkExtractedDocument({ fileName: 'lei.txt', fileType: 'txt', title: 'Lei', sections: [{ content, page: null, title: null, section: null }] })
  assert.ok(chunks.length > 1)
  assert.ok(chunks.every((chunk) => chunk.estimatedTokens <= 1000))
})

test('SHA-256 é estável para conteúdo normalizado', () => {
  assert.equal(hashRagContent('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('deduplicação usa SHA-256 e reindexa chunks', () => {
  const draft = { content: 'mesmo conteúdo', estimatedTokens: 4, page: 1, title: null, section: null }
  const result = finalizeChunks([draft, draft, { ...draft, content: 'outro conteúdo' }])
  assert.equal(result.duplicates, 1)
  assert.deepEqual(result.chunks.map((chunk) => chunk.index), [0, 1])
})

test('validação aceita somente 768 valores finitos', () => {
  const valid = { provider: 'google' as const, model: 'gemini-embedding-2', dimensions: 768, values: Array(768).fill(0.1) }
  assert.equal(validateRagEmbedding(valid), valid)
  assert.throws(() => validateRagEmbedding({ ...valid, values: [0.1] }), /768/)
  assert.throws(() => validateRagEmbedding({ ...valid, values: [...Array(767).fill(0.1), Number.NaN] }), /inválidos/)
  assert.throws(() => validateRagEmbedding({ ...valid, values: [...Array(767).fill(0.1), Number.POSITIVE_INFINITY] }), /inválidos/)
})

test('provider Google usa batch, chave em header e prefixos de retrieval sem chamada real', async () => {
  let capturedUrl = ''
  let capturedInit: RequestInit | undefined
  const mockFetch: typeof fetch = async (input, init) => {
    capturedUrl = String(input)
    capturedInit = init
    return Response.json({ embeddings: [
      { values: Array(768).fill(0.25) },
      { values: Array(768).fill(0.5) },
    ] })
  }
  const client = createGoogleEmbeddingClient({ apiKey: 'test-only-key', fetchImpl: mockFetch })
  const result = await client.embed([
    { content: 'documento sem título', taskType: 'RETRIEVAL_DOCUMENT' },
    { content: 'consulta', taskType: 'RETRIEVAL_QUERY' },
  ])
  assert.equal(result.length, 2)
  assert.doesNotMatch(capturedUrl, /test-only-key/)
  assert.equal(new Headers(capturedInit?.headers).get('x-goog-api-key'), 'test-only-key')
  assert.match(String(capturedInit?.body), /title: none \| text: documento sem título/)
  assert.match(String(capturedInit?.body), /task: search result \| query: consulta/)
  assert.match(String(capturedInit?.body), /"outputDimensionality":768/)
})

const queryRequest = [{ content: 'consulta', taskType: 'RETRIEVAL_QUERY' as const }]
const validEmbeddingResponse = () => Response.json({ embeddings: [{ values: Array(768).fill(0.25) }] })

test('provider repete 429 no mesmo batch e preserva embedding de 768 dimensões', async () => {
  let calls = 0
  const delays: number[] = []
  const client = createGoogleEmbeddingClient({
    apiKey: 'test-only-key',
    fetchImpl: async () => ++calls === 1 ? new Response(null, { status: 429 }) : validEmbeddingResponse(),
    sleep: async (delay) => { delays.push(delay) },
    random: () => 0,
  })
  const result = await client.embed(queryRequest)
  assert.equal(calls, 2)
  assert.deepEqual(delays, [2_000])
  assert.equal(result[0].values.length, 768)
})

test('provider repete 503 e conclui após sucesso', async () => {
  let calls = 0
  const client = createGoogleEmbeddingClient({
    apiKey: 'test-only-key',
    fetchImpl: async () => ++calls === 1 ? new Response(null, { status: 503 }) : validEmbeddingResponse(),
    sleep: async () => {},
  })
  const result = await client.embed(queryRequest)
  assert.equal(calls, 2)
  assert.equal(result.length, 1)
})

test('provider respeita Retry-After válido sem espera real', async () => {
  let calls = 0
  const delays: number[] = []
  const client = createGoogleEmbeddingClient({
    apiKey: 'test-only-key',
    fetchImpl: async () => ++calls === 1
      ? new Response(null, { status: 429, headers: { 'Retry-After': '12' } })
      : validEmbeddingResponse(),
    sleep: async (delay) => { delays.push(delay) },
  })
  await client.embed(queryRequest)
  assert.equal(calls, 2)
  assert.deepEqual(delays, [12_000])
})

test('provider não repete HTTP 400', async () => {
  let calls = 0
  const client = createGoogleEmbeddingClient({
    apiKey: 'test-only-key',
    fetchImpl: async () => { calls += 1; return new Response(null, { status: 400 }) },
    sleep: async () => { assert.fail('HTTP 400 não deve aguardar retry') },
  })
  await assert.rejects(() => client.embed(queryRequest), /\(400\)/)
  assert.equal(calls, 1)
})

test('provider encerra após cinco tentativas e não expõe API key', async () => {
  const apiKey = 'test-only-secret-key'
  let calls = 0
  const delays: number[] = []
  const urls: string[] = []
  const client = createGoogleEmbeddingClient({
    apiKey,
    fetchImpl: async (input) => {
      calls += 1
      urls.push(String(input))
      return new Response(null, { status: 503 })
    },
    sleep: async (delay) => { delays.push(delay) },
    random: () => 0,
  })
  let errorMessage = ''
  await assert.rejects(async () => client.embed(queryRequest), (error: unknown) => {
    errorMessage = error instanceof Error ? error.message : String(error)
    return true
  })
  assert.equal(calls, 5)
  assert.deepEqual(delays, [2_000, 4_000, 8_000, 16_000])
  assert.ok(urls.every((url) => !url.includes(apiKey)))
  assert.doesNotMatch(errorMessage, new RegExp(apiKey))
})

test('provider expõe diagnóstico estruturado e sanitizado para RESOURCE_EXHAUSTED', async () => {
  const apiKey = 'test-only-secret-key'
  let calls = 0
  const client = createGoogleEmbeddingClient({
    apiKey,
    fetchImpl: async () => {
      calls += 1
      return Response.json({ error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        message: `Quota exceeded; api_key=${apiKey}`,
        details: [
          { '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'RATE_LIMIT_EXCEEDED' },
          { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{
            subject: 'project:test',
            description: `token=${apiKey}`,
            quotaMetric: 'generativelanguage.googleapis.com/embed_content_requests',
            quotaId: 'EmbedContentRequestsPerMinutePerProjectPerModel',
            quotaDimensions: { model: 'gemini-embedding-2', credential: apiKey },
          }] },
        ],
      } }, { status: 429 })
    },
    sleep: async () => {},
    random: () => 0,
  })
  await assert.rejects(() => client.embed(queryRequest), (error: unknown) => {
    assert.ok(error instanceof RagEmbeddingProviderError)
    assert.equal(error.httpStatus, 429)
    assert.equal(error.diagnostics?.googleCode, 429)
    assert.equal(error.diagnostics?.googleStatus, 'RESOURCE_EXHAUSTED')
    assert.equal(error.diagnostics?.reason, 'RATE_LIMIT_EXCEEDED')
    assert.equal(error.diagnostics?.quotaViolations?.[0].quotaId, 'EmbedContentRequestsPerMinutePerProjectPerModel')
    assert.doesNotMatch(JSON.stringify(error.diagnostics), new RegExp(apiKey))
    assert.doesNotMatch(error.message, new RegExp(apiKey))
    return true
  })
  assert.equal(calls, 5)
})

test('provider captura RetryInfo e Retry-After sem mudar a política de espera', async () => {
  let calls = 0
  const delays: number[] = []
  const client = createGoogleEmbeddingClient({
    apiKey: 'test-only-key',
    fetchImpl: async () => {
      calls += 1
      return Response.json({ error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '17s' }],
      } }, { status: 429, headers: { 'Retry-After': '3' } })
    },
    sleep: async (delay) => { delays.push(delay) },
  })
  await assert.rejects(() => client.embed(queryRequest), (error: unknown) => {
    assert.ok(error instanceof RagEmbeddingProviderError)
    assert.equal(error.diagnostics?.retryDelay, '17s')
    assert.equal(error.diagnostics?.retryAfter, '3')
    return true
  })
  assert.equal(calls, 5)
  assert.deepEqual(delays, [3_000, 3_000, 3_000, 3_000])
})

test('provider mantém suporte a Retry-After em HTTP-date', async () => {
  let calls = 0
  const delays: number[] = []
  const retryDate = new Date(Date.now() + 10_000).toUTCString()
  const client = createGoogleEmbeddingClient({
    apiKey: 'test-only-key',
    fetchImpl: async () => ++calls === 1
      ? new Response(null, { status: 429, headers: { 'Retry-After': retryDate } })
      : validEmbeddingResponse(),
    sleep: async (delay) => { delays.push(delay) },
  })
  await client.embed(queryRequest)
  assert.equal(calls, 2)
  assert.ok(delays[0] >= 8_000 && delays[0] <= 10_000)
})

test('provider trata corpo inválido e vazio sem perder o status HTTP', async () => {
  for (const [body, expectedMessage] of [['not-json', 'not-json'], [null, undefined]] as const) {
    let calls = 0
    const client = createGoogleEmbeddingClient({
      apiKey: 'test-only-key',
      fetchImpl: async () => { calls += 1; return new Response(body, { status: 429 }) },
      sleep: async () => {},
    })
    await assert.rejects(() => client.embed(queryRequest), (error: unknown) => {
      assert.ok(error instanceof RagEmbeddingProviderError)
      assert.equal(error.diagnostics?.httpStatus, 429)
      assert.equal(error.diagnostics?.googleMessage, expectedMessage)
      return true
    })
    assert.equal(calls, 5)
  }
})

test('provider limita mensagem diagnóstica e não repete HTTP 400', async () => {
  let calls = 0
  const client = createGoogleEmbeddingClient({
    apiKey: 'test-only-key',
    fetchImpl: async () => { calls += 1; return Response.json({ error: { message: 'x'.repeat(2_000) } }, { status: 400 }) },
    sleep: async () => { assert.fail('HTTP 400 não deve aguardar retry') },
  })
  await assert.rejects(() => client.embed(queryRequest), (error: unknown) => {
    assert.ok(error instanceof RagEmbeddingProviderError)
    assert.equal(error.diagnostics?.googleMessage?.length, 750)
    return true
  })
  assert.equal(calls, 1)
})

test('payload administrativo é estrito', () => {
  assert.equal(ragIngestionRequestSchema.safeParse({ material_id: 25 }).success, true)
  assert.equal(ragIngestionRequestSchema.safeParse({ material_id: '25' }).success, false)
  assert.equal(ragIngestionRequestSchema.safeParse({ material_id: 25, url: 'https://example.test' }).success, false)
})

test('migration de ativação mantém contrato restrito e transacional', async () => {
  const sql = await readFile('supabase/migrations/20260925_019_activate_rag_ingestion_v2.sql', 'utf8')
  assert.match(sql, /security invoker/i)
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /v_document_count <> v_ingestion\.total_chunks/)
  assert.match(sql, /set ativa = false/)
  assert.match(sql, /set status = 'concluida', ativa = true/)
  assert.match(sql, /revoke all[\s\S]+from public, anon, authenticated/i)
  assert.match(sql, /grant execute[\s\S]+to service_role/i)
  assert.doesNotMatch(sql, /delete\s+from/i)
})
