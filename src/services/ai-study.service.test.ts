import assert from 'node:assert/strict'
import test from 'node:test'
import { aiStudyService, type AiStudyAction } from './ai-study.service'

test('todos os modos de estudo usam exclusivamente /api/ai/study', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; body: Record<string, unknown> }> = []
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    },
  })
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) })
    return Response.json({ conteudo: 'ok', cached: false, fontes: [] })
  }

  try {
    const modes: AiStudyAction[] = ['explicacao', 'resumo', 'aula', 'pergunta']
    for (const mode of modes) await aiStudyService.studyQuestion('42', mode, mode === 'pergunta' ? 'Dúvida' : undefined)
    assert.deepEqual(calls.map((call) => call.url), modes.map(() => '/api/ai/study'))
    assert.deepEqual(calls.map((call) => call.body.acao), modes)
    assert.equal(calls.some((call) => call.url.includes('functions/v1') || call.url.toLowerCase().includes('n8n')), false)
  } finally {
    globalThis.fetch = originalFetch
    Reflect.deleteProperty(globalThis, 'window')
  }
})

test('cliente apresenta erro amigável sem detalhes internos', async () => {
  const originalFetch = globalThis.fetch
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } },
  })
  globalThis.fetch = async () => Response.json({ error: 'Não foi possível gerar o conteúdo.' }, { status: 500 })
  try {
    await assert.rejects(aiStudyService.studyQuestion('42', 'resumo'), /Não foi possível gerar o conteúdo/)
  } finally {
    globalThis.fetch = originalFetch
    Reflect.deleteProperty(globalThis, 'window')
  }
})
