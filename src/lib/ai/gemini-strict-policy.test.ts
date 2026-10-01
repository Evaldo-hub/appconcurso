import assert from 'node:assert/strict'
import test from 'node:test'
import { GeminiGenerationError, generateWithGemini, type GeminiGenerationTelemetry } from './gemini'

const success = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }), { status: 200 })
const failure = () => new Response(JSON.stringify({ error: { message: 'high demand' } }), { status: 503 })

async function withMockedGemini(handler: (url: string, call: number) => Response, run: (calls: string[]) => Promise<void>) {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.GEMINI_API_KEY
  const originalModel = process.env.GEMINI_MODEL
  const calls: string[] = []
  process.env.GEMINI_API_KEY = 'strict-test-secret'
  process.env.GEMINI_MODEL = 'model-A'
  globalThis.fetch = (async (input) => { calls.push(String(input)); return handler(String(input), calls.length) }) as typeof fetch
  try { await run(calls) } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey
    if (originalModel === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = originalModel
  }
}

const noWait = { sleep: async () => {}, random: () => 0, now: () => 0 }

test('strict success reports requested/effective model without fallback', async () => {
  await withMockedGemini(() => success(), async (calls) => {
    let telemetry: GeminiGenerationTelemetry | undefined
    await generateWithGemini({ prompt: 'private prompt', fallbackPolicy: 'forbid', onTelemetry: (value) => { telemetry = value } })
    assert.deepEqual(telemetry, { requestedModel: 'model-A', effectiveModel: 'model-A', attempts: 1, fallbackUsed: false })
    assert.equal(calls.length, 1)
  })
})

test('strict retry stays on requested model', async () => {
  await withMockedGemini((_url, call) => call === 1 ? failure() : success(), async (calls) => {
    let telemetry: GeminiGenerationTelemetry | undefined
    await generateWithGemini({ prompt: 'private prompt', fallbackPolicy: 'forbid', onTelemetry: (value) => { telemetry = value }, retryDependencies: noWait })
    assert.equal(calls.length, 2)
    assert.ok(calls.every((url) => url.includes('model-A')))
    assert.deepEqual(telemetry, { requestedModel: 'model-A', effectiveModel: 'model-A', attempts: 2, fallbackUsed: false })
  })
})

test('strict exhaustion never calls configured fallback model', async () => {
  await withMockedGemini(() => failure(), async (calls) => {
    await assert.rejects(generateWithGemini({ prompt: 'private prompt', fallbackPolicy: 'forbid', retryDependencies: noWait }), (error: unknown) => {
      assert.ok(error instanceof GeminiGenerationError)
      assert.deepEqual({ requestedModel: error.requestedModel, effectiveModel: error.effectiveModel, attempts: error.attempts, fallbackUsed: error.fallbackUsed },
        { requestedModel: 'model-A', effectiveModel: 'model-A', attempts: 3, fallbackUsed: false })
      return true
    })
    assert.equal(calls.length, 3)
    assert.ok(calls.every((url) => url.includes('model-A')))
  })
})

test('strict permanent error is structured and stops after one attempt', async () => {
  await withMockedGemini(() => new Response(JSON.stringify({ error: { message: 'invalid request' } }), { status: 400 }), async (calls) => {
    await assert.rejects(generateWithGemini({ prompt: 'private prompt', fallbackPolicy: 'forbid' }), (error: unknown) => {
      assert.ok(error instanceof GeminiGenerationError)
      assert.equal(error.attempts, 1)
      assert.equal(error.requestedModel, 'model-A')
      assert.equal(error.effectiveModel, 'model-A')
      assert.equal(error.fallbackUsed, false)
      return true
    })
    assert.equal(calls.length, 1)
  })
})

test('allow preserves fallback compatibility and exposes model switch', async () => {
  await withMockedGemini((url) => url.includes('model-A') ? failure() : success(), async (calls) => {
    let telemetry: GeminiGenerationTelemetry | undefined
    await generateWithGemini({ prompt: 'private prompt', fallbackPolicy: 'allow', onTelemetry: (value) => { telemetry = value }, retryDependencies: noWait })
    assert.equal(calls.length, 4)
    assert.deepEqual(telemetry, { requestedModel: 'model-A', effectiveModel: 'gemini-3.6-flash', attempts: 4, fallbackUsed: true })
  })
})
