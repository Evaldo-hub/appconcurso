import assert from 'node:assert/strict'
import test from 'node:test'
import { buildStudyPrompt, generateStudyContent, normalizeStudyContent, type GenerateStudyContentInput } from './study-question'

const questao: GenerateStudyContentInput['questao'] = {
  disciplina: 'Raciocínio Lógico',
  assunto: 'Equivalências',
  subassunto: 'Implicação',
  banca: 'Banca exemplo',
  enunciado: 'Classifique (p e q) implica p.',
  alternativa_a: 'Contradição',
  alternativa_b: 'Tautologia',
  alternativa_c: 'Contingência',
  alternativa_d: 'Equivalência',
  alternativa_e: 'Nenhuma',
  gabarito: 'B',
  explicacao: 'A expressão é sempre verdadeira.',
}

test('prompt de resumo usa linguagem simples, resolução curta e quatro seções', () => {
  const prompt = buildStudyPrompt({ action: 'resumo', questao })
  for (const section of ['## O que a questão cobra', '## Resolução rápida', '## Pegadinha', '## Memorize']) {
    assert.match(prompt, new RegExp(section))
  }
  assert.doesNotMatch(prompt, /^## Regra principal$/m)
  assert.match(prompt, /questão específica/)
  assert.match(prompt, /120 a 280 palavras/)
  assert.match(prompt, /candidato que acabou de errá-la/)
  assert.match(prompt, /linguagem simples, direta e didática/)
  assert.match(prompt, /significativamente menor que uma aula completa/)
  assert.match(prompt, /passos curtos e completos, sem saltos lógicos/)
  assert.doesNotMatch(prompt, /Produza uma AULA COMPLETA/)
})

test('prompt de resumo exige consistência, não força gabarito e limita pegadinhas e tabelas', () => {
  const prompt = buildStudyPrompt({ action: 'resumo', questao })
  assert.match(prompt, /cada conclusão decorre da etapa imediatamente anterior/)
  assert.match(prompt, /Nunca force uma derivação para chegar ao gabarito informado/)
  assert.match(prompt, /sinalize claramente a inconsistência/)
  assert.match(prompt, /somente o erro mais provável e específico/)
  assert.match(prompt, /no máximo três regras ou frases curtas/)
  assert.match(prompt, /Não use tabelas por padrão/)
  assert.match(prompt, /Markdown\/LaTeX compatível/)
  assert.match(prompt, /blocos \\\[ \.\.\. \\\]/)
})

test('resumo solicita Markdown textual, sem envelope JSON', () => {
  const prompt = buildStudyPrompt({ action: 'resumo', questao })
  assert.match(prompt, /Retorne somente o texto Markdown do resumo/)
  assert.match(prompt, /Não envolva a resposta em JSON/)
  assert.match(prompt, /não serialize o Markdown como string JSON/)
})

test('normaliza somente envelope JSON seguro e preserva Markdown e LaTeX', () => {
  const markdown = '## Resolução rápida\n\n\\[\\forall x\\,P(x)\\]'
  const wrapped = JSON.stringify({ resposta: markdown })
  assert.equal(normalizeStudyContent(wrapped), markdown)
  assert.equal(normalizeStudyContent(markdown), markdown)
  assert.equal(normalizeStudyContent(JSON.stringify({ resposta: markdown, extra: true })), JSON.stringify({ resposta: markdown, extra: true }))
})

test('geração de estudo pede texto ao Gemini e preserva o contrato conteudo', async () => {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.GEMINI_API_KEY
  let requestBody: Record<string, unknown> | undefined
  process.env.GEMINI_API_KEY = 'chave-de-teste'
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ resposta: '## O que a questão cobra\n\nTexto simples com \\forall.' }) }] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const result = await generateStudyContent({ action: 'resumo', questao })
    const config = requestBody?.generationConfig as Record<string, unknown>
    assert.equal('responseMimeType' in config, false)
    assert.deepEqual(result, { conteudo: '## O que a questão cobra\n\nTexto simples com \\forall.', provider: 'gemini' })
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = originalKey
  }
})

test('prompt final real da aula chega idêntico ao Gemini e ao fallback Groq', async () => {
  const originalFetch = globalThis.fetch
  const originalGeminiKey = process.env.GEMINI_API_KEY
  const originalGroqKey = process.env.GROQ_API_KEY
  const geminiPrompts: string[] = []
  let groqPrompt = ''
  process.env.GEMINI_API_KEY = 'gemini-teste'
  process.env.GROQ_API_KEY = 'groq-teste'

  globalThis.fetch = async (input, init) => {
    const url = String(input)
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    if (url.includes('generativelanguage.googleapis.com')) {
      const contents = body.contents as Array<{ parts: Array<{ text: string }> }>
      geminiPrompts.push(contents[0].parts[0].text)
      return new Response(JSON.stringify({ error: { message: 'temporarily unavailable' } }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const messages = body.messages as Array<{ content: string }>
    groqPrompt = messages[0].content
    return new Response(JSON.stringify({ choices: [{ message: { content: '## Aula\n\nConteúdo.' } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const result = await generateStudyContent({ action: 'aula', questao })
    assert.equal(result.provider, 'groq')
    assert.ok(geminiPrompts.length >= 1)
    assert.ok(geminiPrompts.every((prompt) => prompt === groqPrompt))
    assert.match(groqPrompt, /Não produza tabelas Markdown/)
    assert.match(groqPrompt, /blockquotes com > ou \\>/)
    assert.match(groqPrompt, /Use lista com marcadores, não lista numerada/)
    assert.match(groqPrompt, /Evite \\varphi, \\alpha, \\beta/)
    assert.match(groqPrompt, /evite generalizações absolutas/)
  } finally {
    globalThis.fetch = originalFetch
    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = originalGeminiKey
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = originalGroqKey
  }
})

test('prompt de aula completa permanece com estrutura aprofundada', () => {
  const prompt = buildStudyPrompt({ action: 'aula', questao })
  assert.match(prompt, /Produza uma AULA COMPLETA/)
  for (const section of ['## 1. Entenda o tema', '## 2. Conceitos fundamentais', '## 3. Regras necessárias', '## 4. Resolução passo a passo', '## 5. Análise das alternativas', '## 6. Pegadinhas importantes', '## 7. Entenda de forma intuitiva', '## 8. O que memorizar']) {
    assert.match(prompt, new RegExp(section))
  }
  assert.match(prompt, /ensine cada regra integralmente apenas em "Regras necessárias"/)
  assert.match(prompt, /não verdades absolutas/)
  assert.match(prompt, /Não atribua comportamento, frequência ou pegadinha típica à banca sem/)
  assert.match(prompt, /Não invente nem introduza automaticamente\s+mnemônicos ou apelidos/)
  assert.match(prompt, /Produza Markdown limpo/)
  assert.match(prompt, /use \\\( \.\.\. \\\)/)
  assert.match(prompt, /nunca uma tabela Markdown/)
  assert.match(prompt, /Use lista com marcadores, não lista numerada/)
  assert.match(prompt, /Cada regra deve ser um bullet independente e completo/)
  assert.match(prompt, /não crie sublistas dentro\s+dos bullets/)
  assert.match(prompt, /Não use lista numerada nesta seção/)
  assert.match(prompt, /\*\*Passo 1 — ação realizada\*\*/)
  assert.match(prompt, /\*\*Passo 2 — ação realizada\*\*/)
  assert.doesNotMatch(prompt, /\\-/)
  assert.match(prompt, /descreva exatamente o erro presente na\s+fórmula daquela alternativa/)
  assert.match(prompt, /comparando-a com a derivação obtida/)
  assert.match(prompt, /não atribua à alternativa uma alteração que ela não realizou/)
  assert.match(prompt, /Não produza tabelas Markdown, linhas com \| ou \\\|/)
  assert.match(prompt, /blockquotes com > ou \\>/)
  assert.match(prompt, /Prefira somente \\forall, \\exists, \\neg, \\land, \\lor, \\rightarrow e \\equiv/)
  for (const unsupported of ['\\varphi', '\\alpha', '\\beta', '\\Phi', '\\Longleftrightarrow', '\\bigl', '\\bigr', '\\boxed', '\\displaystyle']) {
    assert.match(prompt, new RegExp(`Evite[\\s\\S]*${unsupported.replace('\\', '\\\\')}`))
  }
  assert.doesNotMatch(prompt, /120 a 280 palavras/)
  assert.doesNotMatch(prompt, /Regra do MANÉ/)
})

test('refinamento da aula não incorpora instruções exclusivas do resumo', () => {
  const aula = buildStudyPrompt({ action: 'aula', questao })
  const resumo = buildStudyPrompt({ action: 'resumo', questao })
  assert.doesNotMatch(aula, /candidato que acabou de errá-la/)
  assert.doesNotMatch(aula, /Use estas quatro seções/)
  assert.match(resumo, /Use estas quatro seções/)
  assert.match(resumo, /120 a 280 palavras/)
})

test('prompt de pergunta IA permanece direto e conserva a pergunta do aluno', () => {
  const prompt = buildStudyPrompt({ action: 'pergunta', questao, pergunta: 'Por que a alternativa B está correta?' })
  assert.match(prompt, /Responda diretamente à pergunta do aluno/)
  assert.match(prompt, /Por que a alternativa B está correta\?/)
  assert.doesNotMatch(prompt, /120 a 280 palavras/)
})

test('questão 178 instrui Resumo e Aula a preservar a derivação independente', () => {
  const questao178: GenerateStudyContentInput['questao'] = {
    ...questao,
    enunciado: '((p ∧ q) → p)',
    alternativa_a: 'p ∨ q',
    alternativa_b: '¬p ∧ q',
    alternativa_c: '¬p ∨ q',
    alternativa_d: 'p ∧ ¬q',
    alternativa_e: '¬p ∨ ¬q',
    gabarito: 'C',
    explicacao: 'A alternativa C é correta.',
  }

  for (const action of ['resumo', 'aula'] as const) {
    const prompt = buildStudyPrompt({ action, questao: questao178 })
    assert.match(prompt, /resolva e verifique a questão de forma independente/i)
    assert.match(prompt, /Nunca force uma derivação para chegar ao gabarito informado/)
    assert.match(prompt, /preserve a resolução correta/)
    assert.match(prompt, /nenhuma\s+alternativa/i)
    assert.match(prompt, /Não invente equivalência para justificar o gabarito/)
    assert.match(prompt, /Se uma etapa chegar a V, F, um valor\s+numérico ou uma expressão\s+final/)
    assert.match(prompt, /\(\(p ∧ q\) → p\)/)
    assert.match(prompt, /ALTERNATIVA C:\s+¬p ∨ q/)
    assert.match(prompt, /GABARITO:\s+C/)
  }
})

test('questão com gabarito coerente continua sendo tratada normalmente', () => {
  const coerente: GenerateStudyContentInput['questao'] = {
    ...questao,
    enunciado: 'Qual expressão equivale a (p → q)?',
    alternativa_c: '¬p ∨ q',
    gabarito: 'C',
    explicacao: 'A implicação equivale a ¬p ∨ q.',
  }
  const prompt = buildStudyPrompt({ action: 'aula', questao: coerente })
  assert.match(prompt, /ALTERNATIVA C:\s+¬p ∨ q/)
  assert.match(prompt, /GABARITO:\s+C/)
  assert.match(prompt, /Se a resolução independente contradisser o gabarito/)
  assert.doesNotMatch(prompt, /esta questão possui inconsistência/)
})
