import assert from 'node:assert/strict'
import test from 'node:test'
import type { RagGenerationContext } from './generation-context'
import { parseRagGeneratedQuestion, resolveGeneratedQuestionSources } from './generated-question'

const validQuestion = {
  numeroQuestao: 1,
  disciplina: ' Direito Constitucional ',
  assunto: ' Administração Pública ',
  subassunto: null,
  banca: ' Cebraspe ',
  dificuldade: 'media' as const,
  enunciado: ' Enunciado completo da questão. ',
  alternativas: { A: ' Alternativa A ', B: 'Alternativa B', C: 'Alternativa C', D: 'Alternativa D', E: 'Alternativa E' },
  gabarito: 'A' as const,
  explicacao: ' Explicação fundamentada. ',
  sourceIndexes: [1],
}

const context: RagGenerationContext = {
  query: 'consulta', hasContext: true, contextText: 'contexto', contextCharacters: 8, estimatedTokens: 2, sourceCount: 3,
  retrieval: { provider: 'google', model: 'gemini-embedding-2', dimensions: 768, matchCount: 3 },
  sources: [
    { sourceIndex: 1, documentId: 2830, materialId: 4, ingestionId: 2, concursoId: 7, provaId: null, pagina: 34, chunkIndex: 33, similarity: 0.7, arquivoOrigem: 'edital.pdf', githubPath: 'concursos/edital.pdf', content: 'Fonte 1' },
    { sourceIndex: 2, documentId: 2889, materialId: 4, ingestionId: 2, concursoId: 7, provaId: null, pagina: 78, chunkIndex: 92, similarity: 0.68, arquivoOrigem: 'edital.pdf', githubPath: 'concursos/edital.pdf', content: 'Fonte 2' },
    { sourceIndex: 3, documentId: 2890, materialId: 4, ingestionId: 2, concursoId: 7, provaId: null, pagina: 79, chunkIndex: 93, similarity: 0.67, arquivoOrigem: 'edital.pdf', githubPath: 'concursos/edital.pdf', content: 'Fonte 3' },
  ],
}

test('questão válida é aceita e strings recebem somente trim', () => {
  const parsed = parseRagGeneratedQuestion(validQuestion)
  assert.equal(parsed.disciplina, 'Direito Constitucional')
  assert.equal(parsed.assunto, 'Administração Pública')
  assert.equal(parsed.enunciado, 'Enunciado completo da questão.')
  assert.equal(parsed.alternativas.A, 'Alternativa A')
  assert.equal(parsed.explicacao, 'Explicação fundamentada.')
})

const invalidCases: Array<[string, unknown]> = [
  ['numeroQuestao zero', { ...validQuestion, numeroQuestao: 0 }],
  ['numeroQuestao negativo', { ...validQuestion, numeroQuestao: -1 }],
  ['disciplina vazia', { ...validQuestion, disciplina: ' ' }],
  ['assunto vazio', { ...validQuestion, assunto: '' }],
  ['subassunto vazio', { ...validQuestion, subassunto: ' ' }],
  ['banca vazia', { ...validQuestion, banca: '' }],
  ['dificuldade inválida', { ...validQuestion, dificuldade: 'extrema' }],
  ['enunciado vazio', { ...validQuestion, enunciado: '' }],
  ['alternativa A ausente', { ...validQuestion, alternativas: { B: 'B', C: 'C', D: 'D', E: 'E' } }],
  ['alternativa E ausente', { ...validQuestion, alternativas: { A: 'A', B: 'B', C: 'C', D: 'D' } }],
  ['alternativa extra', { ...validQuestion, alternativas: { ...validQuestion.alternativas, F: 'F' } }],
  ['alternativa vazia', { ...validQuestion, alternativas: { ...validQuestion.alternativas, C: ' ' } }],
  ['gabarito inválido', { ...validQuestion, gabarito: 'F' }],
  ['explicação vazia', { ...validQuestion, explicacao: ' ' }],
  ['sourceIndexes vazio', { ...validQuestion, sourceIndexes: [] }],
  ['sourceIndex zero', { ...validQuestion, sourceIndexes: [0] }],
  ['sourceIndex negativo', { ...validQuestion, sourceIndexes: [-1] }],
  ['sourceIndexes duplicados', { ...validQuestion, sourceIndexes: [1, 1] }],
  ['ID inventado pelo modelo', { ...validQuestion, documentId: 999 }],
]

for (const [name, value] of invalidCases) {
  test(`rejeita ${name}`, () => assert.throws(() => parseRagGeneratedQuestion(value), /Questão RAG inválida/))
}

test('parser aceita JSON simples e JSON em code fence externo', () => {
  const json = JSON.stringify(validQuestion)
  assert.equal(parseRagGeneratedQuestion(json).numeroQuestao, 1)
  assert.equal(parseRagGeneratedQuestion(`\n\`\`\`json\n${json}\n\`\`\`\n`).gabarito, 'A')
})

test('parser rejeita JSON quebrado sem tentar corrigir', () => {
  assert.throws(() => parseRagGeneratedQuestion('{"numeroQuestao":'), /JSON válido/)
})

test('resolução de sourceIndex 1 usa somente IDs reais do contexto', () => {
  const question = parseRagGeneratedQuestion(validQuestion)
  const [source] = resolveGeneratedQuestionSources(question, context)
  assert.deepEqual(source, context.sources[0])
  assert.equal(source.documentId, 2830)
  assert.equal(source.materialId, 4)
  assert.equal(source.ingestionId, 2)
  assert.equal(source.pagina, 34)
  assert.equal(source.chunkIndex, 33)
  assert.equal(source.similarity, 0.7)
})

test('resolução [1,3] preserva a ordem declarada', () => {
  const question = parseRagGeneratedQuestion({ ...validQuestion, sourceIndexes: [1, 3] })
  const sources = resolveGeneratedQuestionSources(question, context)
  assert.deepEqual(sources.map((source) => source.sourceIndex), [1, 3])
  assert.deepEqual(sources.map((source) => source.documentId), [2830, 2890])
})

test('referência acima de sourceCount falha explicitamente', () => {
  const question = parseRagGeneratedQuestion({ ...validQuestion, sourceIndexes: [1, 4] })
  assert.throws(() => resolveGeneratedQuestionSources(question, context), /sourceIndex 4/)
})

test('contexto sem fontes não permite questão RAG', () => {
  const question = parseRagGeneratedQuestion(validQuestion)
  assert.throws(() => resolveGeneratedQuestionSources(question, { ...context, hasContext: false, sourceCount: 0, sources: [] }), /sem contexto/)
})

test('teste integrado local parseia e resolve a fonte 2830', () => {
  const question = parseRagGeneratedQuestion(JSON.stringify(validQuestion))
  const sources = resolveGeneratedQuestionSources(question, context)
  assert.deepEqual(question.sourceIndexes, [1])
  assert.deepEqual(sources.map((source) => source.documentId), [2830])
  assert.deepEqual(sources.map((source) => source.materialId), [4])
  assert.deepEqual(sources.map((source) => source.ingestionId), [2])
  assert.deepEqual(sources.map((source) => source.pagina), [34])
  assert.deepEqual(sources.map((source) => source.chunkIndex), [33])
})
