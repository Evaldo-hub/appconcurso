import assert from 'node:assert/strict'
import test from 'node:test'
import { generateWithGemini } from './gemini'

const fixedModels = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite']
const success = () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }] }), { status: 200 })
const failure = (status: number, message = 'transient', retryAfter?: string) => new Response(
  JSON.stringify({ error: { message } }),
  { status, headers: retryAfter === undefined ? undefined : { 'Retry-After': retryAfter } },
)

interface HarnessOptions {
  model?: string
  random?: number
  now?: number
}

async function harness(
  handler: (url: string, call: number) => Response | Promise<Response>,
  run: (state: { calls: string[]; delays: number[]; metadata: Array<{ model: string }> }) => Promise<void>,
  options: HarnessOptions = {},
) {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.GEMINI_API_KEY
  const originalModel = process.env.GEMINI_MODEL
  const state = { calls: [] as string[], delays: [] as number[], metadata: [] as Array<{ model: string }> }
  process.env.GEMINI_API_KEY = 'unit-test-secret'
  if (options.model) process.env.GEMINI_MODEL = options.model
  else delete process.env.GEMINI_MODEL
  globalThis.fetch = (async (input) => {
    const url = String(input)
    state.calls.push(url)
    return handler(url, state.calls.length)
  }) as typeof fetch
  try {
    await run(state)
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = originalKey
    if (originalModel === undefined) delete process.env.GEMINI_MODEL
    else process.env.GEMINI_MODEL = originalModel
  }
}

function generate(state: { delays: number[]; metadata: Array<{ model: string }> }, options: HarnessOptions = {}) {
  return generateWithGemini({
    prompt: 'PROMPT_PRIVADO_DE_TESTE',
    onMetadata: (value) => state.metadata.push(value),
    retryDependencies: {
      sleep: async (delay) => { state.delays.push(delay) },
      random: () => options.random ?? 0,
      now: () => options.now ?? Date.now(),
    },
  })
}

test('sucesso na primeira tentativa identifica o modelo primário', async () => {
  await harness(() => success(), async (state) => {
    assert.equal(await generate(state), '{"ok":true}')
    assert.equal(state.calls.length, 1)
    assert.equal(state.metadata.at(-1)?.model, fixedModels[0])
  })
})

test('429 repete o mesmo modelo e tem sucesso na segunda tentativa', async () => {
  await harness((_url, call) => call === 1 ? failure(429) : success(), async (state) => {
    await generate(state)
    assert.equal(state.calls.length, 2)
    assert.match(state.calls[0], /gemini-3\.6-flash/)
    assert.match(state.calls[1], /gemini-3\.6-flash/)
    assert.deepEqual(state.delays, [2000])
  })
})

test('503 repete o mesmo modelo e tem sucesso na terceira tentativa', async () => {
  await harness((_url, call) => call < 3 ? failure(503, 'high demand') : success(), async (state) => {
    await generate(state)
    assert.equal(state.calls.length, 3)
    state.calls.forEach((url) => assert.match(url, /gemini-3\.6-flash/))
    assert.deepEqual(state.delays, [2000, 4000])
  })
})

for (const status of [408, 500, 502, 504]) {
  test(`HTTP ${status} faz retry no mesmo modelo`, async () => {
    await harness((_url, call) => call === 1 ? failure(status) : success(), async (state) => {
      await generate(state)
      assert.equal(state.calls.length, 2)
      assert.match(state.calls[1], /gemini-3\.6-flash/)
    })
  })
}

for (const [label, firstResponse] of [
  ['timeout', () => Promise.reject(new DOMException('timeout', 'AbortError'))],
  ['network error', () => Promise.reject(new Error('network failed'))],
  ['resposta vazia', () => new Response(JSON.stringify({ candidates: [] }), { status: 200 })],
] as const) {
  test(`${label} faz retry no mesmo modelo`, async () => {
    await harness((_url, call) => call === 1 ? firstResponse() : success(), async (state) => {
      await generate(state)
      assert.equal(state.calls.length, 2)
      assert.match(state.calls[1], /gemini-3\.6-flash/)
    })
  })
}

test('Retry-After em segundos controla a espera', async () => {
  await harness((_url, call) => call === 1 ? failure(429, 'limit', '7') : success(), async (state) => {
    await generate(state)
    assert.deepEqual(state.delays, [7000])
  })
})

test('Retry-After HTTP-date controla a espera', async () => {
  const now = Date.parse('2026-09-25T12:00:00Z')
  await harness((_url, call) => call === 1 ? failure(503, 'busy', new Date(now + 9000).toUTCString()) : success(), async (state) => {
    await generate(state, { now })
    assert.deepEqual(state.delays, [9000])
  })
})

test('Retry-After inválido usa backoff e valor acima do limite vira 30 segundos', async () => {
  await harness((_url, call) => call === 1 ? failure(429, 'limit', 'inválido') : call === 2 ? failure(429, 'limit', '60') : success(), async (state) => {
    await generate(state)
    assert.deepEqual(state.delays, [2000, 30000])
  })
})

test('backoff sem jitter é 2000/4000 e jitter é injetável', async () => {
  await harness((_url, call) => call < 3 ? failure(503) : success(), async (state) => {
    await generate(state, { random: 0.5 })
    assert.deepEqual(state.delays, [2250, 4250])
  })
})

test('fallback começa na tentativa 1 após três falhas e sucesso encerra', async () => {
  await harness((url) => url.includes(fixedModels[0]) ? failure(503) : success(), async (state) => {
    await generate(state)
    assert.equal(state.calls.length, 4)
    state.calls.slice(0, 3).forEach((url) => assert.match(url, /gemini-3\.6-flash/))
    assert.match(state.calls[3], /gemini-3\.7-flash/)
    assert.equal(state.metadata.at(-1)?.model, fixedModels[1])
  })
})

for (const status of [400, 401, 403, 404]) {
  test(`HTTP permanente ${status} encerra com uma request`, async () => {
    await harness(() => failure(status, status === 400 ? 'high demand' : 'temporarily unavailable'), async (state) => {
      await assert.rejects(generate(state))
      assert.equal(state.calls.length, 1)
      assert.equal(state.delays.length, 0)
    })
  })
}

test('cinco modelos transitórios resultam exatamente em 15 requests', async () => {
  await harness(() => failure(503), async (state) => {
    await assert.rejects(generate(state), /Nenhum modelo Gemini/)
    assert.equal(state.calls.length, 15)
    assert.equal(state.delays.length, 10)
  })
})

test('modelo customizado cria sexto modelo e máximo de 18 requests', async () => {
  await harness(() => failure(503), async (state) => {
    await assert.rejects(generate(state), /Nenhum modelo Gemini/)
    assert.equal(state.calls.length, 18)
    assert.match(state.calls[0], /modelo-customizado/)
  }, { model: 'modelo-customizado' })
})

test('erros não expõem API key, URL com key, prompt ou contexto', async () => {
  const leakedUrl = 'https://generativelanguage.googleapis.com/v1beta/models/x:generateContent?key=unit-test-secret'
  await harness(() => Promise.reject(new Error(`${leakedUrl} PROMPT_PRIVADO_DE_TESTE`)), async (state) => {
    await assert.rejects(generate(state), (error: unknown) => {
      const message = (error as Error).message
      assert.doesNotMatch(message, /unit-test-secret/)
      assert.doesNotMatch(message, /\?key=/)
      assert.doesNotMatch(message, /PROMPT_PRIVADO_DE_TESTE/)
      return true
    })
    assert.equal(state.calls.length, 15)
  })
})
