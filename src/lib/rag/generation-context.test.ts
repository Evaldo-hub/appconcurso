import assert from 'node:assert/strict'
import test from 'node:test'
import { createRagGenerationContextBuilder } from './generation-context'
import type { RagRetrievalInput, RagRetrievalResult } from './types'

const fullContent = `começo\n${'conteúdo integral '.repeat(80)}\ncláusula no final`
const matches: RagRetrievalResult['matches'] = [
  {
    documentId: 20, materialId: 4, ingestionId: 2, concursoId: 7, provaId: null,
    pagina: 34, chunkIndex: 33, content: fullContent, similarity: 0.7,
    arquivoOrigem: 'edital.pdf', githubPath: 'concursos/edital.pdf',
    disciplina: null, assunto: null, subassunto: null, embeddingModel: 'gemini-embedding-2',
  },
  {
    documentId: 10, materialId: 5, ingestionId: 3, concursoId: 7, provaId: 8,
    pagina: null, chunkIndex: 1, content: 'segundo conteúdo', similarity: 0.66,
    arquivoOrigem: null, githubPath: 'concursos/segundo.txt',
    disciplina: 'Direito', assunto: 'Prazo', subassunto: null, embeddingModel: 'gemini-embedding-2',
  },
]

function result(overrides: Partial<RagRetrievalResult> = {}): RagRetrievalResult {
  return { query: 'consulta', matches, provider: 'google', model: 'gemini-embedding-2', dimensions: 768, ...overrides }
}

test('builder chama retrieval uma vez e repassa todos os filtros sem alteração', async () => {
  const calls: RagRetrievalInput[] = []
  const builder = createRagGenerationContextBuilder(async (input) => { calls.push(input); return result({ query: input.query.trim() }) })
  const input = { query: ' consulta ', concursoId: 7, provaId: 8, disciplina: 'D', assunto: 'A', subassunto: 'S', limit: 5, threshold: 0.65 }
  await builder(input)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], input)
})

test('builder preserva ordem, índices e metadados das fontes', async () => {
  const context = await createRagGenerationContextBuilder(async () => result())({ query: 'consulta', concursoId: 7 })
  assert.deepEqual(context.sources.map((source) => source.sourceIndex), [1, 2])
  assert.deepEqual(context.sources.map((source) => source.documentId), [20, 10])
  assert.deepEqual(context.sources[0], {
    sourceIndex: 1, documentId: 20, materialId: 4, ingestionId: 2, concursoId: 7,
    provaId: null, pagina: 34, chunkIndex: 33, similarity: 0.7,
    arquivoOrigem: 'edital.pdf', githubPath: 'concursos/edital.pdf', content: fullContent,
  })
  assert.match(context.contextText, /^\[FONTE 1\]/)
  assert.ok(context.contextText.indexOf('[FONTE 1]') < context.contextText.indexOf('[FONTE 2]'))
})

test('builder preserva conteúdo completo sem resumo ou truncagem', async () => {
  const context = await createRagGenerationContextBuilder(async () => result())({ query: 'consulta', concursoId: 7 })
  assert.ok(context.contextText.includes(fullContent))
  assert.ok(context.contextText.endsWith('segundo conteúdo'))
  assert.equal(context.contextCharacters, context.contextText.length)
  assert.ok(context.estimatedTokens > 0)
})

test('zero matches representa ausência de contexto, não erro', async () => {
  const context = await createRagGenerationContextBuilder(async () => result({ matches: [] }))({ query: 'consulta', concursoId: 7 })
  assert.equal(context.hasContext, false)
  assert.equal(context.contextText, '')
  assert.deepEqual(context.sources, [])
  assert.equal(context.sourceCount, 0)
  assert.equal(context.contextCharacters, 0)
  assert.equal(context.estimatedTokens, 0)
  assert.equal(context.retrieval.matchCount, 0)
})

test('erro do retrieval é propagado sem virar ausência de contexto', async () => {
  const failure = new Error('falha controlada')
  const builder = createRagGenerationContextBuilder(async () => { throw failure })
  await assert.rejects(() => builder({ query: 'consulta', concursoId: 7 }), (error) => error === failure)
})

test('retorno não contém embedding, credenciais ou headers', async () => {
  const context = await createRagGenerationContextBuilder(async () => result())({ query: 'consulta', concursoId: 7 })
  const serialized = JSON.stringify(context)
  assert.equal('embedding' in context, false)
  assert.equal('queryEmbedding' in context, false)
  assert.ok(context.sources.every((source) => !('embedding' in source) && !('values' in source)))
  assert.doesNotMatch(serialized, /api[_-]?key/i)
  assert.doesNotMatch(serialized, /service[_-]?role/i)
  assert.doesNotMatch(serialized, /authorization/i)
})
