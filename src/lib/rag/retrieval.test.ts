import assert from 'node:assert/strict'
import test from 'node:test'
import { createRagRetrievalService, ragCandidateLimit, selectDiverseRagResults } from './retrieval'
import { RagEmbeddingProviderError, type RagEmbeddingProviderClient } from './embeddings'
import type { RagRetrievalRpcClient } from './retrieval'

const vector = Array(768).fill(0.1)
const fullContent = `início ${'conteúdo completo '.repeat(100)} cláusula final`
const validRow = {
  document_id: 2830,
  material_id: 4,
  concurso_id: 7,
  prova_id: null,
  content: fullContent,
  pagina: 34,
  chunk_index: 33,
  disciplina: null,
  assunto: null,
  subassunto: null,
  arquivo_origem: 'edital.pdf',
  github_path: 'concursos/edital.pdf',
  ingestion_id: 2,
  embedding_model: 'gemini-embedding-2',
  similarity: 0.7,
}

function dependencies(data: unknown = [validRow]) {
  const embeddingCalls: unknown[] = []
  const rpcCalls: Array<{ name: string; parameters: Record<string, unknown> }> = []
  const embeddings: RagEmbeddingProviderClient = {
    async embed(requests) {
      embeddingCalls.push(requests)
      return [{ values: vector, provider: 'google', model: 'gemini-embedding-2', dimensions: 768 }]
    },
  }
  const rpc: RagRetrievalRpcClient = {
    async rpc(name, parameters) {
      rpcCalls.push({ name, parameters })
      return { data, error: null }
    },
  }
  return { service: createRagRetrievalService({ embeddings, rpc }), embeddingCalls, rpcCalls, embeddings, rpc }
}

test('retrieval rejeita query vazia e concursoId inválido', async () => {
  const { service } = dependencies()
  await assert.rejects(() => service({ query: '  ', concursoId: 7 }), /consulta/)
  await assert.rejects(() => service({ query: 'teste', concursoId: 0 }), /concursoId/)
})

test('retrieval aplica limit 8 e threshold 0.65 por padrão', async () => {
  const { service, rpcCalls } = dependencies([])
  const result = await service({ query: 'teste', concursoId: 7 })
  assert.deepEqual(result.matches, [])
  assert.equal(rpcCalls[0].parameters.p_match_count, 32)
  assert.equal(rpcCalls[0].parameters.p_similarity_threshold, 0.65)
})

test('retrieval aceita limit 20 e threshold explícito válido', async () => {
  const { service, rpcCalls } = dependencies([])
  await service({ query: 'teste', concursoId: 7, limit: 20, threshold: 0 })
  assert.equal(rpcCalls[0].parameters.p_match_count, 50)
  assert.equal(rpcCalls[0].parameters.p_similarity_threshold, 0)
})

test('retrieval rejeita limites e thresholds fora da faixa', async () => {
  const { service } = dependencies()
  await assert.rejects(() => service({ query: 'teste', concursoId: 7, limit: 0 }), /limit/)
  await assert.rejects(() => service({ query: 'teste', concursoId: 7, limit: 21 }), /limit/)
  await assert.rejects(() => service({ query: 'teste', concursoId: 7, threshold: -0.1 }), /threshold/)
  await assert.rejects(() => service({ query: 'teste', concursoId: 7, threshold: 1.1 }), /threshold/)
})

test('retrieval gera RETRIEVAL_QUERY e chama somente match_documents_rag_v2 com filtros', async () => {
  const { service, embeddingCalls, rpcCalls } = dependencies([])
  await service({ query: ' consulta ', concursoId: 7, provaId: 3, disciplina: 'Direito', assunto: 'Ato', subassunto: 'Prazo' })
  assert.deepEqual(embeddingCalls[0], [{ content: 'consulta', taskType: 'RETRIEVAL_QUERY' }])
  assert.equal(rpcCalls[0].name, 'match_documents_rag_v2')
  assert.deepEqual(rpcCalls[0].parameters, {
    p_query_embedding: vector,
    p_concurso_id: 7,
    p_prova_id: 3,
    p_match_count: 32,
    p_similarity_threshold: 0.65,
    p_disciplina: 'Direito',
    p_assunto: 'Ato',
    p_subassunto: 'Prazo',
  })
})

test('retrieval preserva content completo e nunca retorna embedding', async () => {
  const { service } = dependencies()
  const result = await service({ query: 'teste', concursoId: 7 })
  assert.equal(result.matches[0].content, fullContent)
  assert.equal('embedding' in result, false)
  assert.equal('embedding' in result.matches[0], false)
})

test('erro da RPC não vira lista vazia nem expõe segredo', async () => {
  const secret = 'service-role-secret-test'
  const { embeddings } = dependencies()
  const service = createRagRetrievalService({
    embeddings,
    rpc: { async rpc() { return { data: null, error: { message: secret } } } },
  })
  await assert.rejects(() => service({ query: 'teste', concursoId: 7 }), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.doesNotMatch(error.message, new RegExp(secret))
    return true
  })
})

test('erro de embedding é explícito e não expõe segredo', async () => {
  const secret = 'gemini-secret-test'
  const { rpc } = dependencies()
  const service = createRagRetrievalService({
    embeddings: { async embed() { throw new Error(secret) } },
    rpc,
  })
  await assert.rejects(() => service({ query: 'teste', concursoId: 7 }), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /embedding/)
    assert.doesNotMatch(error.message, new RegExp(secret))
    return true
  })
})

test('payload inválido da RPC falha explicitamente', async () => {
  const invalidPayload = dependencies({ invalid: true }).service
  await assert.rejects(() => invalidPayload({ query: 'teste', concursoId: 7 }), /payload inválido/)
  const invalidRow = dependencies([{ ...validRow, embedding_model: 'modelo-legado' }]).service
  await assert.rejects(() => invalidRow({ query: 'teste', concursoId: 7 }), /campos essenciais/)
})

function candidate(documentId: number, materialId: number | null, similarity: number) {
  return {
    ...validRow,
    document_id: documentId,
    material_id: materialId,
    similarity,
  }
}

test('diversidade impede domínio de uma fonte e preserva ordem por similarity', async () => {
  const rows = [candidate(1, 8, 0.95), candidate(2, 8, 0.94), candidate(3, 8, 0.93), candidate(4, 7, 0.92), candidate(5, 9, 0.91)]
  const result = await dependencies(rows).service({ query: 'teste', concursoId: 7, limit: 3 })
  assert.deepEqual(result.matches.map((match) => [match.documentId, match.materialId]), [[1, 8], [4, 7], [5, 9]])
})

test('diversidade mantém os melhores chunks quando há apenas um material', async () => {
  const rows = [candidate(1, 6, 0.90), candidate(2, 6, 0.89), candidate(3, 6, 0.88), candidate(4, 6, 0.87)]
  const result = await dependencies(rows).service({ query: 'teste', concursoId: 7, limit: 3 })
  assert.deepEqual(result.matches.map((match) => match.documentId), [1, 2, 3])
})

test('segunda passagem preenche todas as vagas com poucos materiais', async () => {
  const rows = [candidate(1, 20, 0.90), candidate(2, 20, 0.89), candidate(3, 20, 0.88), candidate(4, 21, 0.87)]
  const result = await dependencies(rows).service({ query: 'teste', concursoId: 7, limit: 4 })
  assert.deepEqual(result.matches.map((match) => match.documentId), [1, 2, 3, 4])
})

test('document_id duplicado mantém somente a ocorrência de maior similarity', () => {
  const parsed = [candidate(1, 8, 0.70), candidate(1, 8, 0.95), candidate(2, 7, 0.90)].map((row) => ({
    documentId: row.document_id, materialId: row.material_id, ingestionId: row.ingestion_id,
    concursoId: row.concurso_id, provaId: row.prova_id, content: row.content, similarity: row.similarity,
    arquivoOrigem: row.arquivo_origem, githubPath: row.github_path, pagina: row.pagina,
    chunkIndex: row.chunk_index, disciplina: row.disciplina, assunto: row.assunto,
    subassunto: row.subassunto, embeddingModel: row.embedding_model,
  }))
  const result = selectDiverseRagResults(parsed, 5)
  assert.deepEqual(result.map((match) => [match.documentId, match.similarity]), [[1, 0.95], [2, 0.90]])
})

test('seleção é determinística e material_id ausente não colapsa fontes distintas', async () => {
  const rows = [candidate(1, null, 0.90), candidate(2, null, 0.89), candidate(3, 8, 0.88)]
  const direct = selectDiverseRagResults(rows.map((row) => ({ documentId: row.document_id, materialId: row.material_id, similarity: row.similarity })), 3)
  assert.deepEqual(direct.map((match) => match.documentId), [1, 2, 3])
  const service = dependencies(rows).service
  const first = await service({ query: 'teste', concursoId: 7, limit: 3 })
  const second = await service({ query: 'teste', concursoId: 7, limit: 3 })
  assert.deepEqual(first, second)
  assert.deepEqual(first.matches.map((match) => match.documentId), [3])
})

test('diversidade não reinsere candidato abaixo do threshold', async () => {
  const rows = [candidate(1, 8, 0.80), candidate(2, 7, 0.64), candidate(3, 9, 0.63)]
  const result = await dependencies(rows).service({ query: 'teste', concursoId: 7, limit: 3, threshold: 0.65 })
  assert.deepEqual(result.matches.map((match) => match.documentId), [1])
})

test('limites finais 1, 3 e 5 nunca são excedidos', () => {
  const rows = Array.from({ length: 8 }, (_, index) => ({
    documentId: index + 1, materialId: index + 1, ingestionId: 2, concursoId: 7, provaId: null,
    content: 'x', similarity: 0.9 - index / 100, arquivoOrigem: null, githubPath: 'x.pdf', pagina: 1,
    chunkIndex: index, disciplina: null, assunto: null, subassunto: null, embeddingModel: 'gemini-embedding-2',
  }))
  for (const limit of [1, 3, 5]) assert.equal(selectDiverseRagResults(rows, limit).length, limit)
})

test('candidate pool usa multiplicador 4 e teto 50', () => {
  assert.equal(ragCandidateLimit(5), 20)
  assert.equal(ragCandidateLimit(10), 40)
  assert.equal(ragCandidateLimit(20), 50)
})

test('cenários 7/8 e 11/12 preservam ambos os materiais no Top-K', async () => {
  for (const [primary, revisional] of [[7, 8], [11, 12]]) {
    const rows = [candidate(1, revisional, 0.95), candidate(2, revisional, 0.94), candidate(3, revisional, 0.93), candidate(4, primary, 0.92)]
    const result = await dependencies(rows).service({ query: 'teste', concursoId: 7, limit: 3 })
    assert.deepEqual(new Set(result.matches.map((match) => match.materialId)), new Set([primary, revisional]))
  }
})

test('telemetria registra etapas, dimensoes, candidatos e duracoes sem query ou vetor', async () => {
  const infoCalls: unknown[][] = []
  const originalInfo = console.info
  console.info = (...args: unknown[]) => { infoCalls.push(args) }
  const times = [100, 112, 200, 219]
  try {
    const { embeddings, rpc } = dependencies([validRow])
    const service = createRagRetrievalService({ embeddings, rpc, now: () => times.shift() ?? 219 })
    const result = await service({ query: 'consulta privada de teste', concursoId: 7 })
    assert.equal(result.matches.length, 1)
  } finally {
    console.info = originalInfo
  }
  assert.deepEqual(infoCalls, [
    ['study_rag_retrieval', { event: 'query_embedding_started' }],
    ['study_rag_retrieval', { event: 'query_embedding_finished', dimensions: 768, duration_ms: 12 }],
    ['study_rag_retrieval', { event: 'rpc_started', rpc: 'match_documents_rag_v2' }],
    ['study_rag_retrieval', { event: 'rpc_finished', candidate_count: 1, duration_ms: 19 }],
  ])
  const serialized = JSON.stringify(infoCalls)
  assert.doesNotMatch(serialized, /consulta privada de teste/)
  assert.equal(serialized.includes(JSON.stringify(vector)), false)
})

test('falha de embedding registra diagnostico seguro e preserva RagRetrievalError', async () => {
  const query = 'consulta altamente privada'
  const apiKey = 'AIza12345678901234567890123456789012345'
  const subject = `projects/segredo/${query}`
  const errorCalls: unknown[][] = []
  const originalError = console.error
  console.error = (...args: unknown[]) => { errorCalls.push(args) }
  try {
    const { rpc } = dependencies()
    const service = createRagRetrievalService({
      embeddings: {
        async embed() {
          throw new RagEmbeddingProviderError(`provider recusou ${query} usando ${apiKey}`, true, 429, {
            httpStatus: 429, googleCode: 429, googleStatus: 'RESOURCE_EXHAUSTED', googleMessage: `quota para ${query}`,
            reason: 'RATE_LIMIT_EXCEEDED', retryDelay: '3s', retryAfter: '3',
            quotaViolations: [{ quotaMetric: 'metric-safe', quotaId: 'id-safe', description: 'quota excedida', subject }],
          })
        },
      },
      rpc,
      now: (() => { const values = [10, 25]; return () => values.shift() ?? 25 })(),
    })
    await assert.rejects(() => service({ query, concursoId: 7 }), /Falha ao gerar o embedding/)
  } finally {
    console.error = originalError
  }
  assert.equal(errorCalls.length, 1)
  assert.equal(errorCalls[0][0], 'study_rag_retrieval_error')
  assert.deepEqual(errorCalls[0][1], {
    stage: 'query_embedding', error_name: 'RagEmbeddingProviderError',
    message: 'provider recusou [QUERY_REDACTED] usando [REDACTED]', retryable: true, http_status: 429,
    google_code: 429, google_status: 'RESOURCE_EXHAUSTED', google_message: 'quota para [QUERY_REDACTED]',
    reason: 'RATE_LIMIT_EXCEEDED', retry_delay: '3s', retry_after: '3',
    quota_violations: [{ quotaMetric: 'metric-safe', quotaId: 'id-safe', description: 'quota excedida' }], duration_ms: 15,
  })
  const serialized = JSON.stringify(errorCalls)
  assert.doesNotMatch(serialized, new RegExp(query))
  assert.doesNotMatch(serialized, new RegExp(apiKey))
  assert.doesNotMatch(serialized, /projects\/segredo/)
})

test('falha da RPC registra mensagem segura e preserva RagRetrievalError', async () => {
  const query = 'consulta privada rpc'
  const errorCalls: unknown[][] = []
  const originalError = console.error
  console.error = (...args: unknown[]) => { errorCalls.push(args) }
  try {
    const { embeddings } = dependencies()
    const times = [10, 20, 30, 48]
    const service = createRagRetrievalService({
      embeddings,
      rpc: { async rpc() { return { data: null, error: { message: `falhou ${query}` } } } },
      now: () => times.shift() ?? 48,
    })
    await assert.rejects(() => service({ query, concursoId: 7 }), /RPC RAG-V2 retornou erro/)
  } finally {
    console.error = originalError
  }
  assert.deepEqual(errorCalls, [['study_rag_retrieval_error', {
    stage: 'match_documents_rpc', error_name: 'RagRpcError', message: 'RPC failure without sensitive details.', duration_ms: 18,
  }]])
  const serialized = JSON.stringify(errorCalls)
  assert.doesNotMatch(serialized, new RegExp(query))
  assert.equal(serialized.includes(JSON.stringify(vector)), false)
})
