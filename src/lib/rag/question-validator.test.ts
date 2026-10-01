import assert from 'node:assert/strict'
import test from 'node:test'
import type { RagGeneratedQuestion, ResolvedGeneratedQuestionSource } from './generated-question'
import { createRagQuestionValidator, parseRagQuestionValidation, RagQuestionValidationError } from './question-validator'

const rule = 'O prazo de validade do concurso esgotar-se-á após dois anos, contados a partir da data de publicação da homologação do resultado final, podendo ser prorrogado, uma única vez, por igual período.'
const question: RagGeneratedQuestion = {
  numeroQuestao: 1,
  disciplina: 'Legislação/Normas do Concurso',
  assunto: 'Prazo de validade do concurso',
  subassunto: 'Prorrogação',
  banca: 'Cebraspe',
  dificuldade: 'media',
  enunciado: 'Qual é o prazo de validade e a possibilidade de prorrogação?',
  alternativas: { A: 'Um ano.', B: 'Dois anos, prorrogável uma vez por igual período.', C: 'Quatro anos.', D: 'Indeterminado.', E: 'Dois anos sem prorrogação.' },
  gabarito: 'B',
  explicacao: 'A validade é de dois anos e admite uma prorrogação por igual período.',
  sourceIndexes: [1],
}
const source = (sourceIndex = 1, content = rule): ResolvedGeneratedQuestionSource => ({
  sourceIndex, documentId: 2830 + sourceIndex - 1, materialId: 4, ingestionId: 2, concursoId: 7,
  provaId: null, pagina: 34, chunkIndex: 33, similarity: 0.67, arquivoOrigem: 'edital.pdf',
  githubPath: 'concursos/edital.pdf', content,
})
const approved = {
  verdict: 'approved' as const,
  checks: { statementSupported: true, correctAnswerSupported: true, explanationSupported: true, noContradiction: true, sourcesSufficient: true },
  unsupportedClaims: [] as string[], contradictions: [] as string[], reasoning: 'Todos os elementos são demonstráveis pela fonte.',
}

function setup(output: unknown = approved) {
  let calls = 0
  let prompt = ''
  const validator = createRagQuestionValidator({
    validateWithModel: async (value) => {
      calls += 1
      prompt = value
      return { text: typeof output === 'string' ? output : JSON.stringify(output), provider: 'gemini', model: 'gemini-validator-test' }
    },
  })
  return { validator, state: () => ({ calls, prompt }) }
}

test('questão e fonte válidas chamam validator com todos os dados da questão', async () => {
  const mock = setup()
  await mock.validator({ question, resolvedSources: [source()] })
  assert.equal(mock.state().calls, 1)
  assert.match(mock.state().prompt, new RegExp(question.enunciado.replace('?', '\\?')))
  for (const alternative of Object.values(question.alternativas)) assert.ok(mock.state().prompt.includes(alternative))
  assert.match(mock.state().prompt, /Gabarito: B/)
  assert.ok(mock.state().prompt.includes(question.explicacao))
})

for (const [name, sources, expected] of [
  ['zero fontes', [], 'NO_SOURCES'],
  ['content vazio', [source(1, ' ')], 'EMPTY_SOURCE_CONTENT'],
  ['source duplicada', [source(1), source(1)], 'DUPLICATE_SOURCE'],
] as const) {
  test(`${name} rejeita antes do LLM`, async () => {
    const mock = setup()
    await assert.rejects(mock.validator({ question, resolvedSources: [...sources] }), new RegExp(expected))
    assert.equal(mock.state().calls, 0)
  })
}

test('source declarada não resolvida rejeita antes do LLM', async () => {
  const mock = setup()
  await assert.rejects(mock.validator({ question: { ...question, sourceIndexes: [1, 2] }, resolvedSources: [source(1)] }), /UNRESOLVED_SOURCE/)
  assert.equal(mock.state().calls, 0)
})

test('validator recebe somente o conteúdo das fontes declaradas e resolvidas', async () => {
  const mock = setup()
  await mock.validator({ question, resolvedSources: [source(1, 'CONTEUDO_DECLARADO')] })
  assert.match(mock.state().prompt, /\[FONTE 1\]\nCONTEUDO_DECLARADO/)
  assert.doesNotMatch(mock.state().prompt, /CONTEUDO_NAO_DECLARADO/)
})

test('parser aceita objeto, JSON e code fence JSON', () => {
  assert.equal(parseRagQuestionValidation(approved).verdict, 'approved')
  assert.equal(parseRagQuestionValidation(JSON.stringify(approved)).checks.sourcesSufficient, true)
  assert.equal(parseRagQuestionValidation(`\`\`\`json\n${JSON.stringify(approved)}\n\`\`\``).verdict, 'approved')
})

for (const [name, value] of [
  ['JSON quebrado', '{quebrado'],
  ['campo extra', { ...approved, extra: true }],
  ['check ausente', { ...approved, checks: { ...approved.checks, sourcesSufficient: undefined } }],
  ['boolean string', { ...approved, checks: { ...approved.checks, statementSupported: 'true' } }],
  ['verdict inválido', { ...approved, verdict: 'maybe' }],
] as const) {
  test(`${name} é rejeitado sem reparo`, () => assert.throws(() => parseRagQuestionValidation(value), RagQuestionValidationError))
}

test('todos checks true e model approved resulta em approved', async () => {
  const result = await setup().validator({ question, resolvedSources: [source()] })
  assert.equal(result.modelVerdict, 'approved')
  assert.equal(result.finalVerdict, 'approved')
  assert.deepEqual(result.validatedSourceIndexes, [1])
})

for (const check of ['statementSupported', 'correctAnswerSupported', 'explanationSupported', 'noContradiction', 'sourcesSufficient'] as const) {
  test(`${check} false força final rejected`, async () => {
    const output = { ...approved, checks: { ...approved.checks, [check]: false } }
    const result = await setup(output).validator({ question, resolvedSources: [source()] })
    assert.equal(result.finalVerdict, 'rejected')
  })
}

test('model approved com check false é rejeitado pelo servidor', async () => {
  const result = await setup({ ...approved, checks: { ...approved.checks, explanationSupported: false } }).validator({ question, resolvedSources: [source()] })
  assert.equal(result.modelVerdict, 'approved')
  assert.equal(result.finalVerdict, 'rejected')
})

test('model rejected vence mesmo com todos checks true', async () => {
  const result = await setup({ ...approved, verdict: 'rejected' }).validator({ question, resolvedSources: [source()] })
  assert.equal(result.finalVerdict, 'rejected')
})

test('unsupportedClaims, contradictions e modelo efetivo são preservados', async () => {
  const output = { ...approved, verdict: 'rejected', unsupportedClaims: ['validade de quatro anos'], contradictions: ['fonte estabelece dois anos'], reasoning: 'Há contradição material.' }
  const result = await setup(output).validator({ question, resolvedSources: [source()] })
  assert.deepEqual(result.unsupportedClaims, output.unsupportedClaims)
  assert.deepEqual(result.contradictions, output.contradictions)
  assert.deepEqual(result.validation, { provider: 'gemini', model: 'gemini-validator-test' })
})

test('retorno não contém API key, prompt, conteúdo integral ou credenciais', async () => {
  const result = await setup().validator({ question, resolvedSources: [source()] })
  const serialized = JSON.stringify(result)
  assert.doesNotMatch(serialized, /api.?key|service.?role|authorization|headers/i)
  assert.doesNotMatch(serialized, new RegExp(rule.slice(0, 40)))
})

test('erro do modelo é propagado sem anexar prompt ou contexto', async () => {
  const validator = createRagQuestionValidator({ validateWithModel: async () => { throw new Error('MODEL_UNAVAILABLE') } })
  await assert.rejects(validator({ question, resolvedSources: [source()] }), (error: unknown) => {
    assert.equal((error as Error).message, 'MODEL_UNAVAILABLE')
    assert.doesNotMatch((error as Error).message, /validade do concurso|prazo de validade/i)
    return true
  })
})

test('mock integrado aprova questão coerente', async () => {
  const result = await setup(approved).validator({ question, resolvedSources: [source()] })
  assert.equal(result.finalVerdict, 'approved')
})

test('mock integrado rejeita validade de quatro anos sem base', async () => {
  const incompatible = { ...question, alternativas: { ...question.alternativas, C: 'Quatro anos.' }, gabarito: 'C' as const, explicacao: 'A validade é de quatro anos.' }
  const output = { ...approved, verdict: 'rejected' as const, checks: { ...approved.checks, correctAnswerSupported: false }, unsupportedClaims: ['validade de quatro anos'] }
  const result = await setup(output).validator({ question: incompatible, resolvedSources: [source()] })
  assert.equal(result.finalVerdict, 'rejected')
})
