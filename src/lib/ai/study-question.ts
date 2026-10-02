import { generateWithGemini } from './gemini'
import { generateWithGroq } from './groq'
import { parseAiJson } from './ai-json'
import { mindMapSchema } from './mind-map-schema'

export type StudyAction =
  | 'explicacao'
  | 'resumo'
  | 'aula'
  | 'mapa_mental'
  | 'pergunta'

export interface StudyQuestionData {
  disciplina?: string | null
  assunto?: string | null
  subassunto?: string | null
  banca?: string | null
  enunciado: string
  alternativa_a: string
  alternativa_b: string
  alternativa_c: string
  alternativa_d: string
  alternativa_e: string
  gabarito: string
  explicacao?: string | null
}

export interface GenerateStudyContentInput {
  action: StudyAction
  questao: StudyQuestionData
  pergunta?: string
  contexto?: string
}

export type StudyAiProvider =
  | 'gemini'
  | 'groq'

export interface GenerateStudyContentResult {
  conteudo: string
  provider: StudyAiProvider
}

function buildBaseQuestion(
  questao: StudyQuestionData,
): string {
  return `
DISCIPLINA:
${questao.disciplina || 'Não informada'}

ASSUNTO:
${questao.assunto || 'Não informado'}

SUBASSUNTO:
${questao.subassunto || 'Não informado'}

BANCA:
${questao.banca || 'Não informada'}

ENUNCIADO:
${questao.enunciado}

ALTERNATIVA A:
${questao.alternativa_a}

ALTERNATIVA B:
${questao.alternativa_b}

ALTERNATIVA C:
${questao.alternativa_c}

ALTERNATIVA D:
${questao.alternativa_d}

ALTERNATIVA E:
${questao.alternativa_e}

GABARITO:
${questao.gabarito}

EXPLICAÇÃO JÁ CADASTRADA:
${questao.explicacao || 'Não disponível'}
`.trim()
}

export function buildStudyPrompt(
  input: GenerateStudyContentInput,
): string {
  const questionBlock =
    buildBaseQuestion(input.questao)

  const contextBlock =
    input.contexto?.trim()
      ? `
CONTEXTO DE APOIO:
${input.contexto.trim()}

Use o contexto de apoio quando ele for pertinente.
Não invente informações que contrariem o contexto.
`
      : ''

  const commonInstructions = `
Você é um professor especializado em preparação
para concursos públicos brasileiros.

Responda em português do Brasil.

A resposta deve ser tecnicamente correta,
didática, objetiva e útil para estudo.

Analise especificamente a questão fornecida.

Não altere o enunciado.
Não altere o gabarito informado.
Não invente legislação, jurisprudência,
normas, artigos ou referências.

Quando houver explicação previamente cadastrada,
ela pode ser usada como apoio, mas você deve
produzir uma resposta didática própria.

Não use JSON, exceto quando a tarefa solicitar explicitamente uma estrutura JSON.

Você pode usar Markdown simples para organizar
a explicação.
`.trim()

  let task: string

  switch (input.action) {
    case 'explicacao':
      task = `
TAREFA:
Produza uma EXPLICAÇÃO RÁPIDA da questão.

Explique:
- por que a alternativa correta está correta;
- o conceito principal cobrado;
- o erro central das alternativas incorretas,
  quando isso puder ser determinado com segurança.

Seja direto e evite uma aula extensa.

Finalize com:
"O que memorizar:"
seguido de uma síntese curta.
`.trim()
      break

    case 'resumo':
      task = `
TAREFA:
Produza um RESUMO DE REVISÃO RÁPIDA desta questão específica,
significativamente menor que uma aula completa.

Explique esta questão para um candidato que acabou de errá-la e quer
entender rapidamente por quê. Use linguagem simples, direta e didática,
sem tom acadêmico desnecessário.

Use preferencialmente 120 a 280 palavras. Questões simples podem ficar
abaixo disso; não acrescente texto apenas para atingir um tamanho. Ultrapasse
ligeiramente somente se a resolução realmente exigir. Não escreva introdução
longa, conclusão genérica, despedida ou "Boa revisão!".

Use estas quatro seções, sem criar outras automaticamente:

## O que a questão cobra
Explique o ponto específico cobrado em uma ou duas frases simples.

## Resolução rápida
Resolva a questão em passos curtos e completos, sem saltos lógicos.
Em matemática, lógica, cálculo, SQL, código, redes, algoritmos ou
qualquer raciocínio sequencial, mostre obrigatoriamente a aplicação
da regra aos dados reais da questão.

Inclua diretamente aqui somente as regras indispensáveis, sem criar uma
seção separada de "Regra principal" e sem repetir a mesma explicação.

## Pegadinha
Indique somente o erro mais provável e específico desta questão, de forma curta.
Não use conselhos genéricos como "leia com atenção".

## Memorize
Registre no máximo três regras ou frases curtas do que deve ser memorizado.
Não repita toda a resolução.

ANTES DE RESPONDER, faça silenciosamente estas conferências:
- resolva e verifique a questão de forma independente antes de considerar o gabarito ou a explicação cadastrados;
- confira cada transformação, cálculo ou passo;
- confirme que cada conclusão decorre da etapa imediatamente anterior;
- confirme que a resolução é compatível com o gabarito informado;
- não altere silenciosamente expressões, dados ou premissas;
- não invente uma conclusão diferente da obtida nos passos.

O gabarito e a explicação cadastrados são referências, não uma
verdade absoluta nem uma autorização para manipular a resolução.
Nunca force uma derivação para chegar ao gabarito informado.
Se enunciado, alternativas, gabarito, explicação cadastrada e resolução entrarem em conflito,
preserve a resolução correta e sinalize claramente a inconsistência; não a esconda
nem ensine como correta uma conclusão incompatível com os passos. Se nenhuma
alternativa corresponder ao resultado independente, informe isso inequivocamente.
Não invente equivalência para justificar o gabarito e não altere silenciosamente
premissas, símbolos ou alternativas.

Em lógica, matemática ou outro raciocínio formal, mantenha consistência entre
todas as etapas. Se uma etapa chegar a V, F, um valor numérico ou uma expressão
final, nenhuma etapa seguinte pode substituí-lo por outro resultado sem apresentar
uma equivalência matematicamente válida.

Para fórmulas matemáticas ou lógicas, use Markdown/LaTeX compatível,
preferindo blocos \\[ ... \\] e passos separados. Não concentre uma
sequência longa em uma única fórmula.

Não use tabelas por padrão. Use uma tabela pequena somente quando ela
for realmente o método mais claro, como uma tabela-verdade necessária.
Não invente comportamento da banca sem contexto ou fonte confiável.
Não invente nem introduza mnemônicos ou apelidos que não estejam no contexto da questão.
Retorne somente o texto Markdown do resumo. Não envolva a resposta em JSON,
não use uma chave "resposta" e não serialize o Markdown como string JSON.
`.trim()
      break

    case 'aula':
      task = `
TAREFA:
Produza uma AULA COMPLETA sobre o conteúdo necessário para compreender
e resolver esta questão. Comece pelos conceitos e termine na aplicação.
A aula pode ser detalhada; não imponha um limite artificial pequeno.

Use preferencialmente esta estrutura pedagógica:

## 1. Entenda o tema
Apresente em poucas linhas o que será estudado.

## 2. Conceitos fundamentais
Ensine somente os conceitos necessários para compreender a questão.
Use uma lista com marcadores neste formato, nunca uma tabela Markdown:
- **Nome do conceito:** explicação.

## 3. Regras necessárias
Apresente e explique aqui as regras, equivalências ou procedimentos necessários.
Use lista com marcadores, não lista numerada. Apresente somente regras gerais;
não crie outra regra para uma aplicação particular da regra já ensinada.
Cada regra deve ser um bullet independente e completo, no formato:
- **Nome da regra:** explicação e fórmula necessárias.
Não agrupe várias regras sob um bullet principal, não crie sublistas dentro
dos bullets e não use barra invertida antes do hífen marcador.

## 4. Resolução passo a passo
Aplique as regras diretamente aos dados da questão real. Mostre cada
transformação separadamente e não volte a explicar integralmente regras
já ensinadas na seção anterior.
Não use lista numerada nesta seção. Identifique cada etapa com um rótulo
em negrito, como **Passo 1 — ação realizada**, **Passo 2 — ação realizada**
e assim por diante. Em seguida, mostre a explicação ou fórmula correspondente.

## 5. Análise das alternativas
Analise A, B, C, D e E de forma curta, indicando por que cada alternativa
é correta ou incorreta. Não repita toda a aula para cada alternativa.
Use o formato **A — Correta.** ou **A — Incorreta.**, seguido do motivo curto.
Não use tabela.
Ao explicar uma alternativa incorreta, descreva exatamente o erro presente na
fórmula daquela alternativa, comparando-a com a derivação obtida. Confira se
ela manteve, trocou, negou ou reposicionou cada quantificador, conectivo ou termo;
não atribua à alternativa uma alteração que ela não realizou.

## 6. Pegadinhas importantes
Apresente no máximo duas ou três pegadinhas diretamente relacionadas à questão.

## 7. Entenda de forma intuitiva
Esta seção é opcional. Use-a somente quando uma tradução para linguagem
natural ou um exemplo simples realmente facilitar a compreensão.

## 8. O que memorizar
Faça uma recapitulação extremamente curta, com no máximo três a cinco itens.
Não repita as explicações completas das regras ou da resolução.

REDUÇÃO DE REPETIÇÃO:
- ensine cada regra integralmente apenas em "Regras necessárias";
- na resolução, apenas aplique a regra;
- em "O que memorizar", apenas recapitule sua forma essencial.
- não transforme uma aplicação específica em uma nova regra conceitual.
- evite generalizações absolutas; diga que as regras são suficientes para
  estruturas como a desta questão, quando isso for correto.

CORREÇÃO LÓGICA:
Antes de responder, resolva e verifique a questão de forma independente.
Depois, confira silenciosamente quantificadores, negações,
equivalências, implicações, cálculos, conclusão e compatibilidade com as
alternativas. O gabarito e a explicação cadastrados são dados de referência,
não verdades absolutas. Nunca force uma derivação para chegar ao gabarito informado.
Se a resolução independente contradisser o gabarito, preserve a resolução correta
e explique a inconsistência de maneira inequívoca. Se nenhuma alternativa
corresponder ao resultado, informe claramente que nenhuma alternativa apresentada
é correta. Não invente equivalência para justificar o gabarito e não altere
silenciosamente premissas, símbolos ou alternativas.

Mantenha consistência entre todas as etapas. Se uma etapa chegar a V, F, um valor
numérico ou uma expressão final, as etapas seguintes não podem substituí-lo por
outro resultado sem uma equivalência matematicamente válida.

BANCA E MNEMÔNICOS:
Não atribua comportamento, frequência ou pegadinha típica à banca sem
contexto confiável que sustente especificamente a afirmação. Prefira dizer
"Uma pegadinha possível é...". Não invente nem introduza automaticamente
mnemônicos ou apelidos. Use-os somente se estiverem explicitamente no contexto.

FORMATAÇÃO:
Produza Markdown limpo, sem escapar marcadores Markdown. Use ## para seções,
### para subseções, listas normais e texto sem HTML. Para matemática em bloco,
use \\[ em uma linha, a expressão em linhas próprias e \\] em outra linha.
Para matemática curta, use \\( ... \\). Não misture $$ com texto no mesmo
parágrafo e não escape separadores, títulos ou marcadores Markdown.
Não produza tabelas Markdown, linhas com | ou \\|, blockquotes com > ou \\>,
nem use $$...$$. Para exemplos em linguagem natural, use rótulos em negrito,
como **Frase original:** e **Negação:**, seguidos de texto normal.

SUBCONJUNTO MATEMÁTICO SUPORTADO:
Prefira somente \\forall, \\exists, \\neg, \\land, \\lor, \\rightarrow e \\equiv,
com variáveis simples como P, Q, x, y, A e B. Evite \\varphi, \\alpha, \\beta,
\\Phi, \\Longleftrightarrow, \\bigl, \\bigr, \\boxed e \\displaystyle.
Use uma fórmula importante por bloco quando isso melhorar a leitura e não use
comandos apenas para dimensionamento visual.

Aprofunde o assunto sem perder objetividade e sem inventar informações
apenas para aumentar o tamanho da resposta.
`.trim()
      break

    case 'mapa_mental':
      task = `
TAREFA:
Crie um MAPA MENTAL textual sobre o tema central desta questão utilizando
exclusivamente o conteúdo sustentado pelo CONTEXTO DE APOIO fornecido.

Use a disciplina, o assunto, o subassunto e a questão para identificar o tema.
O tema central deve nomear o conteúdo estudado e nunca ser "Questão" seguido
de um número nem uma simples reformulação do enunciado.

Organize o conteúdo hierarquicamente. Comece pelo TEMA CENTRAL e apresente
quantos ramos forem justificados pelas fontes. Dentro de cada ramo, apresente
subtópicos e palavras-chave relevantes.

Priorize, somente quando sustentados pelas fontes:
- conceitos e classificações;
- objetivos e características;
- etapas e relações importantes;
- exceções e diferenças conceituais;
- pontos com potencial de cobrança em prova.

Não invente informações ausentes das fontes. Não acrescente legislação,
conceitos ou dados externos apenas por conhecimento geral. Quando uma informação
não estiver disponível nas fontes, não a inclua como fato.

Retorne somente JSON válido, sem bloco Markdown, HTML ou texto externo, neste formato:
{
  "titulo": "Tema central curto",
  "descricao": "Síntese visual baseada nas fontes",
  "ramos": [
    {
      "titulo": "Ramo principal",
      "icone": "brain",
      "itens": [
        { "titulo": "Conceito curto", "descricao": "Explicação didática curta" }
      ]
    }
  ],
  "memorizar": ["Ponto objetivo 1", "Ponto objetivo 2", "Ponto objetivo 3"]
}

Gere de 2 a 8 ramos conforme as fontes, com 1 a 8 itens por ramo e de 3 a 7
pontos em memorizar. Não invente conteúdo para preencher o layout.

O campo icone deve ser somente um destes valores:
target, book, brain, workflow, layers, building, scale, list, check, alert, lightbulb.
`.trim()
      break

    case 'pergunta':
      task = `
TAREFA:
O aluno está estudando esta questão e fez
a seguinte pergunta:

"${input.pergunta || ''}"

Responda diretamente à pergunta do aluno,
considerando o contexto da questão.

Se a pergunta extrapolar o que pode ser afirmado
com segurança a partir das informações disponíveis,
deixe essa limitação clara.
`.trim()
      break

    default: {
      const exhaustiveCheck: never =
        input.action
      throw new Error(
        `Ação de estudo inválida: ${exhaustiveCheck}`,
      )
    }
  }

  return [
    commonInstructions,
    '',
    questionBlock,
    '',
    contextBlock,
    '',
    task,
  ]
    .filter(Boolean)
    .join('\n')
}

async function generateWithFallback(
  prompt: string,
  responseFormat: 'json' | 'text' = 'text',
): Promise<{
  conteudo: string
  provider: StudyAiProvider
}> {
  try {
    const conteudo =
      await generateWithGemini({
        prompt,
        temperature: 0.3,
        maxOutputTokens: 8192,
        responseFormat,
      })

    return {
      conteudo,
      provider: 'gemini',
    }
  } catch (geminiError) {
    console.warn(
      '[AI Study] Gemini indisponível. Tentando Groq.',
      geminiError instanceof Error
        ? geminiError.message
        : 'Erro desconhecido',
    )

    try {
      const conteudo =
        await generateWithGroq({
          prompt,
          temperature: 0.3,
          maxOutputTokens: 8192,
          responseFormat,
        })

      return {
        conteudo,
        provider: 'groq',
      }
    } catch (groqError) {
      const geminiMessage =
        geminiError instanceof Error
          ? geminiError.message
          : 'Erro desconhecido'

      const groqMessage =
        groqError instanceof Error
          ? groqError.message
          : 'Erro desconhecido'

      throw new Error(
        'Nenhum provedor de IA conseguiu gerar ' +
          `o conteúdo. Gemini: ${geminiMessage} | ` +
          `Groq: ${groqMessage}`,
      )
    }
  }
}

export async function generateStudyContent(
  input: GenerateStudyContentInput,
): Promise<GenerateStudyContentResult> {
  if (
    input.action === 'pergunta' &&
    !input.pergunta?.trim()
  ) {
    throw new Error(
      'A pergunta do aluno não foi informada.',
    )
  }

  const prompt = buildStudyPrompt(input)

  const generated =
    await generateWithFallback(prompt, input.action === 'mapa_mental' ? 'json' : 'text')

  if (input.action === 'mapa_mental') {
    const parsed = parseAiJson(generated.conteudo, 'mind_map_generation', generated.provider)
    const validated = mindMapSchema.safeParse(parsed)
    if (!validated.success) {
      throw new Error(`${generated.provider} retornou um mapa mental fora do formato esperado.`)
    }
    return {
      conteudo: JSON.stringify(validated.data),
      provider: generated.provider,
    }
  }

  const conteudo = normalizeStudyContent(generated.conteudo)

  if (!conteudo) {
    throw new Error(
      `${generated.provider} retornou conteúdo vazio.`,
    )
  }

  if (conteudo.length > 200000) {
    throw new Error(
      'O conteúdo gerado ultrapassou o limite permitido.',
    )
  }

  return {
    conteudo,
    provider: generated.provider,
  }
}

export function normalizeStudyContent(content: string): string {
  const trimmed = content.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return trimmed

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return trimmed
    const record = parsed as Record<string, unknown>
    const keys = Object.keys(record)
    if (keys.length === 1 && keys[0] === 'resposta' && typeof record.resposta === 'string') {
      return record.resposta.trim()
    }
  } catch {
    return trimmed
  }

  return trimmed
}
