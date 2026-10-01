import assert from 'node:assert/strict'
import test from 'node:test'
import { createSubmitStudyAnswer, type SubmitStudyAnswerDependencies } from './submit-study-answer'

const question = { id: 221, correctAnswer: 'B' as const, explanation: 'Explicação segura.' }

function dependencies(overrides: Partial<SubmitStudyAnswerDependencies> = {}) {
  const writes: Array<{ userId: string; input: unknown }> = []
  const deps: SubmitStudyAnswerDependencies = {
    authenticate: async () => ({ userId: 'session-user' }),
    findQuestion: async () => question,
    findSources: async () => [{ titulo: 'Material', pagina: 3 }],
    persist: async (userId, input) => {
      writes.push({ userId, input })
      return { respostaId: writes.length, correct: input.alternativa_selecionada === 'B', correctAnswer: 'B' }
    },
    ...overrides,
  }
  return { submit: createSubmitStudyAnswer(deps), writes }
}

test('não autenticado para antes da validação e não escreve', async () => {
  let lookedUp = false
  const { submit, writes } = dependencies({ authenticate: async () => null, findQuestion: async () => { lookedUp = true; return question } })
  assert.deepEqual(await submit({ questao_id: 221, alternativa_selecionada: 'B' }), { ok: false, code: 'AUTH_REQUIRED' })
  assert.equal(lookedUp, false); assert.equal(writes.length, 0)
})

for (const input of [{ questao_id: 0, alternativa_selecionada: 'B' }, { questao_id: 221, alternativa_selecionada: 'F' }]) {
  test(`input inválido não escreve: ${JSON.stringify(input)}`, async () => {
    const { submit, writes } = dependencies()
    assert.deepEqual(await submit(input), { ok: false, code: 'INVALID_ANSWER_INPUT' })
    assert.equal(writes.length, 0)
  })
}

test('questão inexistente não escreve', async () => {
  const { submit, writes } = dependencies({ findQuestion: async () => null })
  assert.deepEqual(await submit({ questao_id: 999999, alternativa_selecionada: 'A' }), { ok: false, code: 'QUESTION_NOT_FOUND' })
  assert.equal(writes.length, 0)
})

test('resposta correta é calculada no servidor e retorna DTO seguro', async () => {
  const { submit } = dependencies()
  assert.deepEqual(await submit({ questao_id: 221, alternativa_selecionada: 'B' }), {
    ok: true,
    answer: { correct: true, correctAnswer: 'B', explanation: 'Explicação segura.', sources: [{ titulo: 'Material', pagina: 3 }] },
  })
})

test('resposta incorreta é calculada no servidor', async () => {
  const { submit } = dependencies()
  const result = await submit({ questao_id: 221, alternativa_selecionada: 'A' })
  assert.equal(result.ok && result.answer.correct, false)
})

test('usuario_id sempre vem da sessão e payload rejeita campos de identidade ou correção', async () => {
  const { submit, writes } = dependencies()
  assert.deepEqual(await submit({ questao_id: 221, alternativa_selecionada: 'B', usuario_id: 'attacker' }), { ok: false, code: 'INVALID_ANSWER_INPUT' })
  assert.deepEqual(await submit({ questao_id: 221, alternativa_selecionada: 'B', correta: true }), { ok: false, code: 'INVALID_ANSWER_INPUT' })
  assert.deepEqual(await submit({ questao_id: 221, alternativa_selecionada: 'B', gabarito: 'A' }), { ok: false, code: 'INVALID_ANSWER_INPUT' })
  await submit({ questao_id: 221, alternativa_selecionada: 'B' })
  assert.equal(writes[0]?.userId, 'session-user')
})

test('tempo é inteiro razoável e opcional', async () => {
  const { submit, writes } = dependencies()
  assert.equal((await submit({ questao_id: 221, alternativa_selecionada: 'B', tempo_gasto: 15 })).ok, true)
  assert.equal((writes[0]?.input as { tempo_gasto?: number }).tempo_gasto, 15)
  assert.deepEqual(await submit({ questao_id: 221, alternativa_selecionada: 'B', tempo_gasto: 86_401 }), { ok: false, code: 'INVALID_ANSWER_INPUT' })
})

test('falha do banco não confirma nem revela resposta', async () => {
  const { submit } = dependencies({ persist: async () => { throw new Error('database detail') } })
  assert.deepEqual(await submit({ questao_id: 221, alternativa_selecionada: 'B' }), { ok: false, code: 'ANSWER_PERSISTENCE_FAILED' })
})

test('divergência da RPC é recusada', async () => {
  const { submit } = dependencies({ persist: async () => ({ respostaId: 1, correct: false, correctAnswer: 'A' }) })
  assert.deepEqual(await submit({ questao_id: 221, alternativa_selecionada: 'B' }), { ok: false, code: 'ANSWER_PERSISTENCE_FAILED' })
})

test('política MULTIPLE_ATTEMPTS preserva uma escrita por submissão confirmada', async () => {
  const { submit, writes } = dependencies()
  await submit({ questao_id: 221, alternativa_selecionada: 'A' })
  await submit({ questao_id: 221, alternativa_selecionada: 'B' })
  assert.equal(writes.length, 2)
})
