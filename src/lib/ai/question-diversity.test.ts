import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildQuestionPrompt } from './question-prompt'
import {
  assertUniqueQuestionBatch,
  assertConceptualDiversity,
  validateHistoricalConceptDiversity,
  createBalancedAnswerPlan,
  fetchRecentQuestionStatements,
  RECENT_QUESTIONS_LIMIT,
} from './question-diversity'
import type { GeneratedQuestion, GeneratedQuestionWithDiversity } from './question-schema'

const question = (enunciado: string): GeneratedQuestion => ({
  enunciado,
  alternativa_a: 'Alternativa A', alternativa_b: 'Alternativa B', alternativa_c: 'Alternativa C',
  alternativa_d: 'Alternativa D', alternativa_e: 'Alternativa E', gabarito: 'A', explicacao: 'Explicação.',
})

const conceptualQuestion = (concept: string, approach: string): GeneratedQuestionWithDiversity => ({
  ...question(`Enunciado sobre ${concept} pela abordagem ${approach}.`),
  conceito_central: concept,
  abordagem_cognitiva: approach,
})

test('lote com enunciados exatamente iguais é rejeitado', () => {
  assert.throws(() => assertUniqueQuestionBatch([question('Enunciado suficientemente longo.'), question('Enunciado suficientemente longo.')]), /enunciados repetidos/)
})

test('lote com diferenças apenas de maiúsculas e espaços é rejeitado', () => {
  assert.throws(() => assertUniqueQuestionBatch([question('  Enunciado   suficientemente LONGO. '), question('enunciado suficientemente longo.')]), /enunciados repetidos/)
})

test('questões realmente diferentes permanecem válidas', () => {
  assert.doesNotThrow(() => assertUniqueQuestionBatch([question('Primeiro enunciado suficientemente longo.'), question('Segundo enunciado suficientemente longo.')]))
})

test('conceitos centrais diferentes são aprovados', () => {
  assert.doesNotThrow(() => assertConceptualDiversity([conceptualQuestion('conceito um', 'análise'), conceptualQuestion('conceito dois', 'aplicação')], false))
})

test('conceitos iguais, inclusive com maiúsculas e espaços, são detectados', () => {
  assert.throws(() => assertConceptualDiversity([conceptualQuestion('Tautologia', 'análise'), conceptualQuestion('  tautologia  ', 'aplicação')], false), /conceitos centrais/)
})

test('uma única questão nunca é bloqueada por diversidade conceitual', () => {
  assert.doesNotThrow(() => assertConceptualDiversity([conceptualQuestion('conceito único', 'identificação')], false))
})

test('assunto estreito aceita conceito repetido apenas com abordagens diferentes', () => {
  assert.doesNotThrow(() => assertConceptualDiversity([conceptualQuestion('conceito único', 'identificação'), conceptualQuestion('conceito único', 'aplicação')], true))
  assert.throws(() => assertConceptualDiversity([conceptualQuestion('conceito único', 'identificação'), conceptualQuestion('conceito único', 'IDENTIFICAÇÃO')], true), /conceitos centrais/)
})

test('mapa vazio e conceito histórico isolado não bloqueiam', () => {
  const questions = [conceptualQuestion('conceito um', 'análise')]
  assert.equal(validateHistoricalConceptDiversity(questions, { conceitos: [] }).valid, true)
  assert.equal(validateHistoricalConceptDiversity(questions, { conceitos: [{ nome: 'conceito um', ocorrencias: 1 }] }).valid, true)
})

test('conceito historicamente saturado aciona soft block e conceito diferente passa', () => {
  const map = { conceitos: [{ nome: 'modus tollens', ocorrencias: 4 }, { nome: 'silogismo', ocorrencias: 1 }] }
  const blocked = validateHistoricalConceptDiversity([conceptualQuestion('MODUS   TOLLENS ', 'aplicação')], map)
  assert.deepEqual(blocked, { valid: false, saturatedConcepts: [{ nome: 'modus tollens', historico: 4 }] })
  assert.equal(validateHistoricalConceptDiversity([conceptualQuestion('silogismo', 'aplicação')], map).valid, true)
})

test('assunto estreito não sofre bloqueio histórico e preserva validação de abordagem', () => {
  const map = { conceitos: [{ nome: 'conceito único', ocorrencias: 4 }, { nome: 'outro', ocorrencias: 1 }] }
  const varied = [conceptualQuestion('conceito único', 'identificação'), conceptualQuestion('conceito único', 'aplicação')]
  assert.equal(validateHistoricalConceptDiversity(varied, map, true).valid, true)
  assert.doesNotThrow(() => assertConceptualDiversity(varied, true))
  assert.throws(() => assertConceptualDiversity([conceptualQuestion('conceito único', 'identificação'), conceptualQuestion('conceito único', ' IDENTIFICAÇÃO ')], true))
})

test('prompt funciona sem questões anteriores e exige diversidade do lote', () => {
  const prompt = buildQuestionPrompt({ disciplina: 'Direito', assunto: 'Atos', banca: 'Banca', dificuldade: 'Média', quantidade: 2 })
  assert.match(prompt, /Não há questões anteriores/)
  assert.match(prompt, /questões deste lote também devem ser diferentes entre si/)
})

test('enunciados anteriores entram no contexto sem alternativas ou explicações', () => {
  const prompt = buildQuestionPrompt({
    disciplina: 'Direito', assunto: 'Atos', banca: 'Banca', dificuldade: 'Média', quantidade: 1,
    enunciadosAnteriores: ['Enunciado antigo para evitar repetição.'], planoGabaritos: ['D'],
  })
  assert.match(prompt, /QUESTÕES JÁ EXISTENTES NESTE MESMO CONTEXTO/)
  assert.match(prompt, /Enunciado antigo para evitar repetição/)
  assert.match(prompt, /1: D/)
  assert.match(prompt, /Não altere apenas a letra do gabarito/)
  assert.match(prompt, /identifique mentalmente o conceito central/)
})

test('prompt gerador recebe mapa ordenado e mantém os enunciados históricos', () => {
  const prompt = buildQuestionPrompt({
    disciplina: 'Direito', assunto: 'Atos', banca: 'Banca', dificuldade: 'Média', quantidade: 2,
    enunciadosAnteriores: ['Enunciado histórico preservado.'],
    mapaConceitualHistorico: { conceitos: [{ nome: 'conceito saturado', ocorrencias: 5 }, { nome: 'conceito raro', ocorrencias: 1 }] },
  })
  assert.match(prompt, /MAPA DOS CONCEITOS RECENTEMENTE COBRADOS/)
  assert.ok(prompt.indexOf('conceito saturado — 5') < prompt.indexOf('conceito raro — 1'))
  assert.match(prompt, /Conceitos com mais ocorrências estão mais saturados/)
  assert.match(prompt, /utilize exatamente o mesmo nome canônico do mapa/)
  assert.match(prompt, /premissas, estrutura lógica, operação, regra ou caminho de resolução/)
  assert.match(prompt, /Enunciado histórico preservado/)
})

test('plano de gabaritos usa A-E uma vez em lote de cinco e mantém equilíbrio', () => {
  const plan = createBalancedAnswerPlan(12, () => 0.37)
  assert.deepEqual(new Set(plan.slice(0, 5)), new Set(['A', 'B', 'C', 'D', 'E']))
  const counts = ['A', 'B', 'C', 'D', 'E'].map((letter) => plan.filter((item) => item === letter).length)
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1)
})

test('consulta usa somente o mesmo contexto, ordena recentes e limita a 20', async () => {
  const calls: Array<[string, unknown]> = []
  const filters: Array<[string, unknown]> = []
  const rows = [
    ...Array.from({ length: 25 }, (_, index) => ({ id: index + 1, concurso_id: 9, prova_id: 4, disciplina: 'Direito', assunto: 'Atos', enunciado: `Questão ${index + 1}`, gabarito: 'A' })),
    { id: 100, concurso_id: 9, prova_id: 99, disciplina: 'Direito', assunto: 'Atos', enunciado: 'Outra prova', gabarito: 'B' },
    { id: 101, concurso_id: 9, prova_id: 4, disciplina: 'Outra', assunto: 'Atos', enunciado: 'Outra disciplina', gabarito: 'C' },
    { id: 102, concurso_id: 9, prova_id: 4, disciplina: 'Direito', assunto: 'Outro', enunciado: 'Outro assunto', gabarito: 'D' },
  ]
  const query = {
    select(columns: string) { calls.push(['select', columns]); return this },
    eq(field: string, value: unknown) { calls.push([field, value]); filters.push([field, value]); return this },
    order(field: string, options: unknown) { calls.push(['order', [field, options]]); return this },
    limit(value: number) {
      calls.push(['limit', value])
      const filtered = rows.filter((row) => filters.every(([field, expected]) => row[field as keyof typeof row] === expected))
      return Promise.resolve({ data: filtered.slice(0, value), error: null })
    },
  }
  const admin = { from(table: string) { calls.push(['from', table]); return query } } as unknown as SupabaseClient
  const result = await fetchRecentQuestionStatements(admin, { concursoId: 9, provaId: 4, disciplina: 'Direito', assunto: 'Atos' })
  assert.equal(result.length, RECENT_QUESTIONS_LIMIT)
  assert.equal(result.includes('Outra prova'), false)
  assert.equal(result.includes('Outra disciplina'), false)
  assert.equal(result.includes('Outro assunto'), false)
  assert.ok(calls.some(([key, value]) => key === 'concurso_id' && value === 9))
  assert.ok(calls.some(([key, value]) => key === 'prova_id' && value === 4))
  assert.ok(calls.some(([key, value]) => key === 'disciplina' && value === 'Direito'))
  assert.ok(calls.some(([key, value]) => key === 'assunto' && value === 'Atos'))
  assert.ok(calls.some(([key, value]) => key === 'limit' && value === 20))
})

test('enunciados antigos muito grandes são truncados para controlar tokens', async () => {
  const query = {
    select() { return this }, eq() { return this }, order() { return this },
    limit() { return Promise.resolve({ data: [{ enunciado: 'x'.repeat(1000) }], error: null }) },
  }
  const admin = { from() { return query } } as unknown as SupabaseClient
  const [statement] = await fetchRecentQuestionStatements(admin, { concursoId: 9, provaId: 4, disciplina: 'Direito', assunto: 'Atos' })
  assert.equal(statement.length, 600)
  assert.ok(statement.endsWith('…'))
})
