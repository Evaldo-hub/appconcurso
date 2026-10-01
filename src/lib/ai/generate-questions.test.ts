import assert from 'node:assert/strict'
import test from 'node:test'
import { generateQuestions, type QuestionProviders } from './generate-questions'
import { buildHistoricalConceptMap } from './historical-concept-map'

const response = (statements: string[], concepts = statements.map((_, index) => `conceito ${index + 1}`), approaches = statements.map((_, index) => `abordagem ${index + 1}`), narrowSubject = false) => JSON.stringify({
  assunto_estreito: narrowSubject,
  questoes: statements.map((enunciado, index) => ({
    enunciado,
    alternativa_a: 'A', alternativa_b: 'B', alternativa_c: 'C', alternativa_d: 'D', alternativa_e: 'E',
    gabarito: ['A', 'B', 'C', 'D', 'E'][index % 5], explicacao: 'Explicação válida.',
    conceito_central: concepts[index], abordagem_cognitiva: approaches[index],
  })),
})

const input = { disciplina: 'Português', assunto: 'Texto', banca: 'Banca', dificuldade: 'Média' as const, quantidade: 2 }

test('Gemini indisponível mantém fallback Groq e repassa contexto no prompt', async () => {
  let groqPrompt = ''
  const providers: QuestionProviders = {
    gemini: async () => { throw new Error('indisponível') },
    groq: async ({ prompt }) => { groqPrompt = prompt; return response(['Questão inédita número um.', 'Questão inédita número dois.']) },
  }
  const result = await generateQuestions({ ...input, enunciadosAnteriores: ['Questão antiga do contexto.'] }, providers)
  assert.equal(result.provider, 'groq')
  assert.match(groqPrompt, /Questão antiga do contexto/)
})

test('validação após Zod rejeita duplicidade normalizada no lote', async () => {
  const providers: QuestionProviders = {
    gemini: async () => response(['Questão   repetida com conteúdo.', ' questão repetida COM conteúdo. ']),
    groq: async () => { throw new Error('não deveria executar') },
  }
  await assert.rejects(() => generateQuestions(input, providers), /retentativa ainda apresentou diversidade insuficiente/)
})

test('repetição conceitual dispara uma única retentativa com feedback e a segunda válida é aceita', async () => {
  let calls = 0
  let retryPrompt = ''
  const providers: QuestionProviders = {
    gemini: async ({ prompt }) => {
      calls += 1
      if (calls === 1) return response(['Questão inicial número um.', 'Questão inicial número dois.'], ['tautologia', ' TAUTOLOGIA '])
      retryPrompt = prompt
      return response(['Questão refeita número um.', 'Questão refeita número dois.'], ['tautologia', 'equivalência'])
    },
    groq: async () => { throw new Error('não deveria executar') },
  }
  const result = await generateQuestions(input, providers)
  assert.equal(calls, 2)
  assert.match(retryPrompt, /conceitos centrais repetidos foram: tautologia/i)
  assert.equal(result.questoes.length, 2)
  assert.equal('conceito_central' in result.questoes[0], false)
  assert.equal('abordagem_cognitiva' in result.questoes[0], false)
})

test('segunda geração conceitualmente inválida retorna erro controlado sem terceira tentativa', async () => {
  let calls = 0
  const invalid = response(['Questão conceitual número um.', 'Questão conceitual número dois.'], ['mesmo conceito', 'MESMO   CONCEITO'])
  const providers: QuestionProviders = { gemini: async () => { calls += 1; return invalid }, groq: async () => invalid }
  await assert.rejects(() => generateQuestions(input, providers), /retentativa ainda apresentou diversidade insuficiente/)
  assert.equal(calls, 2)
})

test('assunto estreito permite conceito repetido quando a abordagem cognitiva varia', async () => {
  const narrow = response(
    ['Questão estreita número um.', 'Questão estreita número dois.'],
    ['conceito único', 'conceito único'], ['identificação', 'aplicação'], true,
  )
  const providers: QuestionProviders = { gemini: async () => narrow, groq: async () => narrow }
  const result = await generateQuestions(input, providers)
  assert.equal(result.questoes.length, 2)
})

test('conceito histórico saturado dispara retry com contagem e conceito novo é aceito', async () => {
  let calls = 0
  let retryPrompt = ''
  const providers: QuestionProviders = {
    gemini: async ({ prompt }) => {
      calls += 1
      if (calls === 1) return response(['Questão inicial um.', 'Questão inicial dois.'], ['modus tollens', 'conceito raro'])
      retryPrompt = prompt
      return response(['Questão refeita um.', 'Questão refeita dois.'], ['novo conceito', 'conceito raro'])
    },
    groq: async () => { throw new Error('não deveria executar') },
  }
  const map = { conceitos: [{ nome: 'modus tollens', ocorrencias: 4 }, { nome: 'conceito raro', ocorrencias: 1 }] }
  const result = await generateQuestions({ ...input, mapaConceitualHistorico: map }, providers)
  assert.equal(calls, 2)
  assert.match(retryPrompt, /modus tollens já apareceu 4 vezes/i)
  assert.match(retryPrompt, /menos explorado/i)
  assert.equal(result.questoes.length, 2)
})

test('segunda tentativa com conceito histórico saturado falha sem terceira chamada', async () => {
  let calls = 0
  const saturated = response(['Questão saturada um.', 'Questão saturada dois.'], ['modus tollens', 'conceito raro'])
  const providers: QuestionProviders = { gemini: async () => { calls += 1; return saturated }, groq: async () => saturated }
  const map = { conceitos: [{ nome: 'modus tollens', ocorrencias: 4 }, { nome: 'conceito raro', ocorrencias: 1 }] }
  await assert.rejects(() => generateQuestions({ ...input, mapaConceitualHistorico: map }, providers), /retentativa ainda apresentou diversidade insuficiente/)
  assert.equal(calls, 2)
})

test('falha do mapa representada por mapa vazio não impede a geração', async () => {
  const raw = response(['Questão sem mapa um.', 'Questão sem mapa dois.'])
  const providers: QuestionProviders = { gemini: async () => raw, groq: async () => raw }
  const result = await generateQuestions({ ...input, mapaConceitualHistorico: { conceitos: [] } }, providers)
  assert.equal(result.questoes.length, 2)
})

test('retentativa reutiliza o mesmo mapa sem classificar o histórico novamente', async () => {
  let classifierCalls = 0
  const classifierProviders: QuestionProviders = {
    gemini: async () => { classifierCalls += 1; return JSON.stringify({ conceitos: [{ nome: 'conceito histórico', ocorrencias: 2 }] }) },
    groq: async () => '',
  }
  const map = await buildHistoricalConceptMap({ disciplina: 'Português', assunto: 'Texto', enunciados: ['Histórica 1', 'Histórica 2'] }, classifierProviders)
  let generationCalls = 0
  const generationProviders: QuestionProviders = {
    gemini: async () => {
      generationCalls += 1
      return generationCalls === 1
        ? response(['Questão inicial um.', 'Questão inicial dois.'], ['repetido', 'repetido'])
        : response(['Questão final um.', 'Questão final dois.'], ['novo um', 'novo dois'])
    },
    groq: async () => '',
  }
  const result = await generateQuestions({ ...input, mapaConceitualHistorico: map }, generationProviders)
  assert.equal(result.questoes.length, 2)
  assert.equal(generationCalls, 2)
  assert.equal(classifierCalls, 1)
})

test('geração não reposiciona alternativas ou gabarito após a resposta', async () => {
  const raw = response(['Questão distinta número um.', 'Questão distinta número dois.'])
  const providers: QuestionProviders = { gemini: async () => raw, groq: async () => raw }
  const result = await generateQuestions(input, providers)
  assert.equal(result.questoes[0].alternativa_a, 'A')
  assert.equal(result.questoes[0].gabarito, 'A')
  assert.equal(result.questoes[1].alternativa_b, 'B')
  assert.equal(result.questoes[1].gabarito, 'B')
})
