import assert from 'node:assert/strict'
import test from 'node:test'
import { parseAiJson, type AiJsonStage } from './ai-json'

test('JSON inválido identifica com segurança cada etapa interna', () => {
  const stages: AiJsonStage[] = [
    'question_generation',
    'semantic_validation',
    'question_correction',
    'semantic_revalidation',
  ]
  const logs: unknown[][] = []
  const originalError = console.error
  console.error = (...args: unknown[]) => { logs.push(args) }

  try {
    for (const stage of stages) {
      assert.throws(
        () => parseAiJson('```json\n{"incompleto":', stage, 'gemini'),
        /^Error: gemini retornou JSON inválido\.$/,
      )
    }
  } finally {
    console.error = originalError
  }

  for (const stage of stages) {
    assert.ok(logs.some(([message]) => message === `[AI][${stage}][gemini] invalid_json`))
  }
  assert.ok(logs.every(([message]) => !String(message).includes('{"incompleto"')))
})

test('parser permanece estrito e não remove cercas Markdown silenciosamente', () => {
  const originalError = console.error
  console.error = () => undefined
  try {
    assert.throws(
      () => parseAiJson('```json\n{"valida":true}\n```', 'semantic_validation', 'gemini'),
      /gemini retornou JSON inválido/,
    )
  } finally {
    console.error = originalError
  }
})
