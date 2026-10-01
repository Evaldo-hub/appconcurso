import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { saveGeneratedQuestions } from './save-generated-questions'

test('fluxo existente continua verificando duplicidade e gravando questão nova com hash', async () => {
  const insertedValues: Array<Record<string, unknown>> = []
  const lookup = { select() { return this }, or() { return this }, limit() { return this }, async maybeSingle() { return { data: null, error: null } } }
  const insertion = {
    insert(value: Record<string, unknown>) { insertedValues.push(value); return this }, select() { return this }, async single() { return { data: { id: 321 }, error: null } },
  }
  let calls = 0
  const admin = { from() { calls += 1; return calls === 1 ? lookup : insertion } } as unknown as SupabaseClient
  const result = await saveGeneratedQuestions({
    admin, concursoId: 9, provaId: 2, disciplina: 'Português', assunto: 'Texto', banca: 'Banca', dificuldade: 'Média',
    questoes: [{ enunciado: 'Enunciado novo suficientemente longo.', alternativa_a: 'A', alternativa_b: 'B', alternativa_c: 'C', alternativa_d: 'D', alternativa_e: 'E', gabarito: 'A', explicacao: 'Explicação.' }],
  })
  assert.equal(result.cadastradas, 1)
  assert.deepEqual(result.questao_ids, [321])
  assert.deepEqual(result.resultados, [{ numero_questao: 1, questao_id: 321, status: 'cadastrada' }])
  assert.equal(typeof insertedValues[0]?.hash_questao, 'string')
  assert.equal((insertedValues[0]?.hash_questao as string).length, 64)
  assert.equal('conceito_central' in insertedValues[0], false)
  assert.equal('abordagem_cognitiva' in insertedValues[0], false)
})

test('duplicada preserva resultado individual sem confundir status semântico', async () => {
  const lookup = { select() { return this }, or() { return this }, limit() { return this }, async maybeSingle() { return { data: { id: 456 }, error: null } } }
  const admin = { from() { return lookup } } as unknown as SupabaseClient
  const result = await saveGeneratedQuestions({
    admin, concursoId: 9, provaId: 2, disciplina: 'Português', assunto: 'Texto', banca: 'Banca', dificuldade: 'Média',
    questoes: [{ enunciado: 'Enunciado duplicado suficientemente longo.', alternativa_a: 'A', alternativa_b: 'B', alternativa_c: 'C', alternativa_d: 'D', alternativa_e: 'E', gabarito: 'A', explicacao: 'Explicação.' }],
  })
  assert.equal(result.duplicadas, 1)
  assert.deepEqual(result.resultados, [{ numero_questao: 1, questao_id: 456, status: 'duplicada' }])
})
