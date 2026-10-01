import assert from 'node:assert/strict'
import test from 'node:test'
import { GeminiGenerationError } from './gemini'
import { classifyGeminiGenerationFailure, logStudyRagProviderError } from './gemini-provider-diagnostics'

test('GeminiGenerationError continua mapeando para PROVIDER_FAILURE', () => {
  const error = new GeminiGenerationError('Falha segura.', { requestedModel: 'model-A', effectiveModel: 'model-A', attempts: 1 })
  assert.equal(classifyGeminiGenerationFailure(error), 'PROVIDER_FAILURE')
  assert.equal(classifyGeminiGenerationFailure(new Error('estrutura inválida')), 'REJECTED')
})

test('diagnóstico seguro registra estágio e metadados sem chave ou prompt', () => {
  const apiKey = 'unit-test-provider-key'
  const prompt = 'private test prompt that must never be logged'
  const error = new GeminiGenerationError('Gemini recusou a solicitação.', {
    requestedModel: 'model-A', effectiveModel: 'model-A', attempts: 1, httpStatus: 403, finishReason: 'SAFETY',
  })
  const original = console.error
  const calls: unknown[][] = []
  console.error = (...values: unknown[]) => { calls.push(values) }
  try {
    logStudyRagProviderError('question_generation', error)
    logStudyRagProviderError('semantic_validation', error)
  } finally {
    console.error = original
  }
  assert.equal(calls.length, 2)
  assert.equal(calls[0]?.[0], 'study_rag_provider_error')
  assert.deepEqual(calls[0]?.[1], {
    stage: 'question_generation', error_name: 'GeminiGenerationError', message: 'Gemini recusou a solicitação.',
    requested_model: 'model-A', effective_model: 'model-A', attempts: 1, http_status: 403, finish_reason: 'SAFETY',
  })
  assert.equal((calls[1]?.[1] as { stage?: string }).stage, 'semantic_validation')
  const serialized = JSON.stringify(calls)
  assert.equal(serialized.includes(apiKey), false)
  assert.equal(serialized.includes(prompt), false)
})

test('erro não estruturado não expõe sua mensagem potencialmente sensível', () => {
  const original = console.error
  const calls: unknown[][] = []
  console.error = (...values: unknown[]) => { calls.push(values) }
  try { logStudyRagProviderError('semantic_validation', new Error('prompt privado e secret')) } finally { console.error = original }
  const serialized = JSON.stringify(calls)
  assert.equal(serialized.includes('prompt privado'), false)
  assert.equal(serialized.includes('secret'), false)
})
