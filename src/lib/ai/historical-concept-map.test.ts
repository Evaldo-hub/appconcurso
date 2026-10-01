import assert from 'node:assert/strict'
import test from 'node:test'
import {
  aggregateConcepts,
  buildHistoricalConceptMap,
  historicalConceptMapSchema,
  tryBuildHistoricalConceptMap,
} from './historical-concept-map'
import type { QuestionProviders } from './provider-fallback'

const input = { disciplina: 'Direito', assunto: 'Atos', enunciados: ['Questão histórica um.', 'Questão histórica dois.'] }

test('sem histórico não chama classificador', async () => {
  let calls = 0
  const providers: QuestionProviders = { gemini: async () => { calls += 1; return '' }, groq: async () => { calls += 1; return '' } }
  const result = await buildHistoricalConceptMap({ ...input, enunciados: [] }, providers)
  assert.deepEqual(result, { conceitos: [] })
  assert.equal(calls, 0)
})

test('classificador recebe todos os enunciados em uma única chamada e resposta passa pelo Zod', async () => {
  let calls = 0
  let prompt = ''
  const providers: QuestionProviders = {
    gemini: async (options) => { calls += 1; prompt = options.prompt; return JSON.stringify({ conceitos: [{ nome: 'conceito um', ocorrencias: 1 }, { nome: 'conceito dois', ocorrencias: 1 }] }) },
    groq: async () => { throw new Error('não deveria executar') },
  }
  const result = await buildHistoricalConceptMap(input, providers)
  assert.equal(calls, 1)
  assert.match(prompt, /Questão histórica um/)
  assert.match(prompt, /Questão histórica dois/)
  assert.equal(historicalConceptMapSchema.safeParse(result).success, true)
})

test('vinte questões são classificadas juntas e a soma deve ser coerente', async () => {
  const enunciados = Array.from({ length: 20 }, (_, index) => `Questão ${index + 1}`)
  let prompt = ''
  const providers: QuestionProviders = {
    gemini: async (options) => { prompt = options.prompt; return JSON.stringify({ conceitos: [{ nome: 'conceito agregado', ocorrencias: 20 }] }) },
    groq: async () => '',
  }
  const result = await buildHistoricalConceptMap({ ...input, enunciados }, providers)
  assert.equal(result.conceitos[0].ocorrencias, 20)
  assert.match(prompt, /20\. Questão 20/)
})

test('nomes equivalentes são normalizados, agregados e ordenados por frequência', () => {
  const result = aggregateConcepts([
    { nome: 'Modus Tollens', ocorrencias: 2 },
    { nome: '  modus   tollens ', ocorrencias: 3 },
    { nome: 'tautologia', ocorrencias: 2 },
  ])
  assert.deepEqual(result, [{ nome: 'modus tollens', ocorrencias: 5 }, { nome: 'tautologia', ocorrencias: 2 }])
})

test('falha Gemini usa fallback Groq no classificador', async () => {
  const providers: QuestionProviders = {
    gemini: async () => { throw new Error('indisponível') },
    groq: async () => JSON.stringify({ conceitos: [{ nome: 'conceito', ocorrencias: 2 }] }),
  }
  const result = await buildHistoricalConceptMap(input, providers)
  assert.equal(result.conceitos[0].nome, 'conceito')
})

test('falha total ou mapa incoerente continua sem mapa', async () => {
  const unavailable: QuestionProviders = { gemini: async () => { throw new Error('falhou') }, groq: async () => { throw new Error('falhou') } }
  assert.deepEqual(await tryBuildHistoricalConceptMap(input, unavailable), { conceitos: [] })
  const incoherent: QuestionProviders = { gemini: async () => JSON.stringify({ conceitos: [{ nome: 'conceito', ocorrencias: 1 }] }), groq: async () => '' }
  assert.deepEqual(await tryBuildHistoricalConceptMap(input, incoherent), { conceitos: [] })
})
