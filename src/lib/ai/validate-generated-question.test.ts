import assert from 'node:assert/strict'
import test from 'node:test'
import type { GeneratedQuestion } from './question-schema'
import type { QuestionProviders } from './provider-fallback'
import {
  buildSemanticValidationPrompt,
  isSemanticValidationApproved,
  semanticValidationSchema,
  validateBeforePersistence,
  validateGeneratedQuestion,
  type SemanticValidation,
  type ValidationWorkflowDependencies,
} from './validate-generated-question'

const context = {
  disciplina: 'Raciocínio Lógico',
  assunto: 'Equivalências lógicas',
  subassunto: null,
  banca: 'Banca Exemplo',
  dificuldade: 'Média' as const,
}

const question: GeneratedQuestion = {
  enunciado: 'Qual alternativa equivale logicamente à expressão apresentada?',
  alternativa_a: 'Resposta correta',
  alternativa_b: 'Distrator B',
  alternativa_c: 'Distrator C',
  alternativa_d: 'Distrator D',
  alternativa_e: 'Distrator E',
  gabarito: 'A',
  explicacao: 'A alternativa A é a única resposta correta.',
}

const valid: SemanticValidation = {
  valida: true,
  gabarito_calculado: 'A',
  gabarito_informado: 'A',
  alternativa_correta_existe: true,
  multiplas_corretas: false,
  enunciado_suficiente: true,
  explicacao_consistente: true,
  confianca: 'alta',
  problemas: [],
  justificativa: 'Há exatamente uma alternativa correta.',
}

const invalid = (changes: Partial<SemanticValidation>): SemanticValidation => ({
  ...valid,
  valida: false,
  ...changes,
})

function dependencies(
  validations: SemanticValidation[],
  corrected: GeneratedQuestion = question,
): ValidationWorkflowDependencies & { correctionCalls: () => number } {
  let validationIndex = 0
  let correctionCount = 0
  return {
    validate: async () => ({ result: validations[validationIndex++]!, provider: 'gemini' }),
    correct: async () => { correctionCount += 1; return corrected },
    correctionCalls: () => correctionCount,
  }
}

test('schema estruturado aceita resposta completa e rejeita campos inesperados', () => {
  assert.equal(semanticValidationSchema.safeParse(valid).success, true)
  assert.equal(semanticValidationSchema.safeParse({ ...valid, conclusao_livre: 'sim' }).success, false)
})

test('A: questão válida com gabarito correto é aprovada sem correção', async () => {
  const deps = dependencies([valid])
  let persisted: GeneratedQuestion[] | undefined
  const result = await validateBeforePersistence(
    [question], context, async (items) => { persisted = items; return 'ok' }, undefined, deps,
  )
  assert.equal(result.validacao.aprovadas_primeira_validacao, 1)
  assert.equal(result.validacao.analisadas, 1)
  assert.equal(result.validacao.enviadas_correcao, 0)
  assert.equal(result.validacao.corrigidas_e_aprovadas, 0)
  assert.equal(result.validacao.rejeitadas_validacao, 0)
  assert.equal(deps.correctionCalls(), 0)
  assert.deepEqual(persisted, [question])
  assert.equal(result.resultados[0]?.status_validacao, 'aprovada_diretamente')
})

test('B: gabarito incorreto reprova a primeira validação', async () => {
  const wrongKey = invalid({
    gabarito_calculado: 'B',
    problemas: ['gabarito_inconsistente'],
    justificativa: 'O cálculo resulta em B.',
  })
  const deps = dependencies([wrongKey, wrongKey])
  const result = await validateBeforePersistence([question], context, async () => 'não', undefined, deps)
  assert.equal(deps.correctionCalls(), 1)
  assert.equal(result.validacao.rejeitadas, 1)
})

test('C: nenhuma alternativa correta permanece rejeitada após única correção', async () => {
  const noAnswer = invalid({
    gabarito_calculado: null,
    alternativa_correta_existe: false,
    problemas: ['nenhuma_alternativa_correta'],
  })
  const deps = dependencies([noAnswer, noAnswer])
  let persistenceCalls = 0
  const result = await validateBeforePersistence(
    [question], context, async () => { persistenceCalls += 1 }, undefined, deps,
  )
  assert.equal(result.validacao.rejeitadas, 1)
  assert.equal(persistenceCalls, 0)
})

test('D: múltiplas alternativas corretas são rejeitadas', async () => {
  const multiple = invalid({ multiplas_corretas: true, problemas: ['multiplas_alternativas_corretas'] })
  const result = await validateBeforePersistence(
    [question], context, async () => undefined, undefined, dependencies([multiple, multiple]),
  )
  assert.equal(result.questoes.length, 0)
  assert.deepEqual(result.rejeicoes[0]?.problemas, ['multiplas_alternativas_corretas'])
})

test('E: explicação incompatível é rejeitada', async () => {
  const inconsistent = invalid({ explicacao_consistente: false, problemas: ['explicacao_inconsistente'] })
  const result = await validateBeforePersistence(
    [question], context, async () => undefined, undefined, dependencies([inconsistent, inconsistent]),
  )
  assert.equal(result.validacao.rejeitadas, 1)
})

test('F: primeira validação reprova, correção ocorre uma vez e segunda validação aprova', async () => {
  const wrongKey = invalid({ gabarito_calculado: 'B', problemas: ['gabarito_inconsistente'] })
  const corrected = { ...question, explicacao: 'Explicação corrigida e consistente.' }
  const deps = dependencies([wrongKey, valid], corrected)
  const result = await validateBeforePersistence([question], context, async () => 'gravada', undefined, deps)
  assert.equal(deps.correctionCalls(), 1)
  assert.equal(result.validacao.analisadas, 1)
  assert.equal(result.validacao.enviadas_correcao, 1)
  assert.equal(result.validacao.corrigidas_e_aprovadas, 1)
  assert.equal(result.validacao.rejeitadas_validacao, 0)
  assert.deepEqual(result.questoes, [corrected])
  assert.equal(result.resultados[0]?.status_validacao, 'corrigida_e_aprovada')
  assert.deepEqual(result.resultados[0]?.problemas_correcao, ['gabarito_inconsistente'])
})

test('G: segunda validação inválida encerra o fluxo sem nova correção ou persistência', async () => {
  const bad = invalid({ enunciado_suficiente: false, problemas: ['enunciado_insuficiente'] })
  const deps = dependencies([bad, bad])
  let persistenceCalls = 0
  const result = await validateBeforePersistence(
    [question], context, async () => { persistenceCalls += 1 }, undefined, deps,
  )
  assert.equal(deps.correctionCalls(), 1)
  assert.equal(result.validacao.analisadas, 1)
  assert.equal(result.validacao.enviadas_correcao, 1)
  assert.equal(result.validacao.corrigidas_e_aprovadas, 0)
  assert.equal(result.validacao.rejeitadas_validacao, 1)
  assert.equal(result.validacao.rejeitadas, 1)
  assert.equal(persistenceCalls, 0)
  assert.deepEqual(result.resultados[0], {
    numero_questao: 1,
    questao_id: null,
    status_validacao: 'rejeitada_validacao',
    problemas: ['enunciado_insuficiente'],
    problemas_correcao: ['enunciado_insuficiente'],
  })
})

test('H: falha do Gemini usa Groq na validação independente', async () => {
  let groqPrompt = ''
  const providers: QuestionProviders = {
    gemini: async () => { throw new Error('indisponível') },
    groq: async ({ prompt }) => { groqPrompt = prompt; return JSON.stringify(valid) },
  }
  const result = await validateGeneratedQuestion({ ...context, questao: question }, providers)
  assert.equal(result.provider, 'groq')
  assert.match(groqPrompt, /Resolva a questão independentemente/)
})

test('I: falha de Gemini e Groq bloqueia o fluxo em fail closed', async () => {
  const providers: QuestionProviders = {
    gemini: async () => { throw new Error('gemini fora') },
    groq: async () => { throw new Error('groq fora') },
  }
  await assert.rejects(
    () => validateGeneratedQuestion({ ...context, questao: question }, providers),
    /Nenhum provedor de IA conseguiu responder/,
  )
})

test('questão 178 é identificada como tautologia sem alternativa correta e nunca chega à persistência', async () => {
  const issue178: GeneratedQuestion = {
    enunciado: 'Considere as proposições p e q. Qual das alternativas apresenta a forma lógica equivalente a ((p ∧ q) → p)?',
    alternativa_a: '¬p ∨ ¬q',
    alternativa_b: 'p ∨ ¬q',
    alternativa_c: '¬p ∨ q',
    alternativa_d: 'p ∧ q',
    alternativa_e: '¬p ∧ ¬q',
    gabarito: 'C',
    explicacao: 'A alternativa C seria equivalente à expressão.',
  }
  const noAnswer = invalid({
    gabarito_calculado: null,
    gabarito_informado: 'C',
    alternativa_correta_existe: false,
    explicacao_consistente: false,
    problemas: ['nenhuma_alternativa_correta', 'gabarito_inconsistente', 'erro_logico'],
    justificativa: 'A expressão é tautológica e nenhuma alternativa equivale a V.',
  })
  const prompt = buildSemanticValidationPrompt({ ...context, questao: issue178 })
  assert.match(prompt, /\(\(p ∧ q\) → p\)/)
  assert.match(prompt, /ALTERNATIVA C: ¬p ∨ q/)
  assert.match(prompt, /gabarito informado e a explicação como hipóteses/)

  let persistenceCalls = 0
  const result = await validateBeforePersistence(
    [issue178], context, async () => { persistenceCalls += 1 }, undefined, dependencies([noAnswer, noAnswer]),
  )
  assert.equal(noAnswer.valida, false)
  assert.equal(noAnswer.alternativa_correta_existe, false)
  assert.ok(noAnswer.problemas.includes('gabarito_inconsistente'))
  assert.ok(noAnswer.problemas.includes('nenhuma_alternativa_correta'))
  assert.equal(result.validacao.rejeitadas, 1)
  assert.equal(persistenceCalls, 0)
})

test('validador não pode aprovar resposta cujo gabarito informado diverge da questão', () => {
  assert.equal(isSemanticValidationApproved({
    ...valid,
    gabarito_calculado: 'B',
    gabarito_informado: 'B',
  }, 'A'), false)
})

test('workflow diferencia primeira validação de revalidação semântica', async () => {
  const stages: string[] = []
  const bad = invalid({ problemas: ['gabarito_inconsistente'] })
  await validateBeforePersistence(
    [question],
    context,
    async () => undefined,
    undefined,
    {
      validate: async (_input, _providers, stage) => {
        stages.push(String(stage))
        return { result: bad, provider: 'gemini' }
      },
      correct: async () => question,
    },
  )
  assert.deepEqual(stages, ['semantic_validation', 'semantic_revalidation'])
})

test('lote misto mantém contadores sem dupla contagem e persiste somente quatro aprovadas', async () => {
  const bad = invalid({ problemas: ['gabarito_inconsistente'] })
  const results = [valid, valid, valid, bad, valid, bad, bad]
  let validationIndex = 0
  let correctionCalls = 0
  let persisted: GeneratedQuestion[] = []
  const questions = Array.from({ length: 5 }, (_, index) => ({
    ...question,
    enunciado: `Enunciado suficientemente longo da questão ${index + 1}.`,
  }))

  const result = await validateBeforePersistence(
    questions,
    context,
    async (approved) => { persisted = approved },
    undefined,
    {
      validate: async () => ({ result: results[validationIndex++]!, provider: 'groq' }),
      correct: async ({ questao }) => { correctionCalls += 1; return questao },
    },
  )

  assert.deepEqual({
    analisadas: result.validacao.analisadas,
    aprovadas_primeira_validacao: result.validacao.aprovadas_primeira_validacao,
    enviadas_correcao: result.validacao.enviadas_correcao,
    corrigidas_e_aprovadas: result.validacao.corrigidas_e_aprovadas,
    rejeitadas_validacao: result.validacao.rejeitadas_validacao,
  }, {
    analisadas: 5,
    aprovadas_primeira_validacao: 3,
    enviadas_correcao: 2,
    corrigidas_e_aprovadas: 1,
    rejeitadas_validacao: 1,
  })
  assert.equal(correctionCalls, 2)
  assert.equal(persisted.length, 4)
})

test('logs identificam provider e resultado de validação e revalidação', async () => {
  const messages: string[] = []
  const originalInfo = console.info
  console.info = (...args: unknown[]) => { messages.push(String(args[0])) }
  try {
    const bad = invalid({ problemas: ['gabarito_inconsistente'] })
    await validateBeforePersistence(
      [question], context, async () => undefined, undefined,
      {
        validate: async (_input, _providers, stage) => ({
          result: stage === 'semantic_validation' ? bad : valid,
          provider: 'groq',
        }),
        correct: async () => question,
      },
    )
  } finally {
    console.info = originalInfo
  }

  assert.ok(messages.includes('[AI][semantic_validation][groq][question=1] rejected'))
  assert.ok(messages.includes('[AI][semantic_revalidation][groq][question=1] approved'))
})

test('versão original reprovada nunca é enviada à persistência', async () => {
  const original = { ...question, enunciado: 'ORIGINAL INCORRETO', gabarito: 'C' as const }
  const corrected = {
    ...question,
    enunciado: 'VERSÃO CORRIGIDA',
    alternativa_a: 'Alternativa A corrigida',
    alternativa_b: 'Alternativa B corrigida',
    alternativa_c: 'Alternativa C corrigida',
    alternativa_d: 'Alternativa D corrigida',
    alternativa_e: 'Alternativa E corrigida',
    gabarito: 'D' as const,
    explicacao: 'Explicação corrigida.',
  }
  const first = invalid({ gabarito_informado: 'C', problemas: ['gabarito_inconsistente'] })
  const second = { ...valid, gabarito_calculado: 'D' as const, gabarito_informado: 'D' as const }
  let persisted: GeneratedQuestion[] = []

  const result = await validateBeforePersistence(
    [original], context,
    async (approved) => {
      persisted = approved
      return { resultados: [{ numero_questao: 1, questao_id: 900, status: 'cadastrada' as const }] }
    },
    undefined,
    dependencies([first, second], corrected),
  )

  assert.deepEqual(persisted, [corrected])
  assert.notEqual(persisted[0]?.enunciado, 'ORIGINAL INCORRETO')
  assert.deepEqual(result.resultados[0], {
    numero_questao: 1,
    questao_id: 900,
    status_validacao: 'corrigida_e_aprovada',
    status: 'cadastrada',
    problemas_correcao: ['gabarito_inconsistente'],
  })
})

test('duplicidade mantém dimensões de persistência e validação separadas', async () => {
  const result = await validateBeforePersistence(
    [question], context,
    async () => ({ resultados: [{ numero_questao: 1, questao_id: 700, status: 'duplicada' as const }] }),
    undefined,
    dependencies([valid]),
  )
  assert.equal(result.resultados[0]?.status_validacao, 'aprovada_diretamente')
  assert.equal(result.resultados[0]?.status, 'duplicada')
  assert.equal(result.resultados[0]?.questao_id, 700)
})
