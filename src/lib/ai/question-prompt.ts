import type { HistoricalConceptMap } from './historical-concept-map'

interface QuestionPromptInput {
  disciplina: string
  assunto: string
  banca: string
  dificuldade: 'Fácil' | 'Média' | 'Difícil'
  quantidade: number
  contexto?: string
  enunciadosAnteriores?: string[]
  planoGabaritos?: string[]
  feedbackDiversidade?: string
  mapaConceitualHistorico?: HistoricalConceptMap
}

export function buildQuestionPrompt({
  disciplina,
  assunto,
  banca,
  dificuldade,
  quantidade,
  contexto,
  enunciadosAnteriores = [],
  planoGabaritos = [],
  feedbackDiversidade,
  mapaConceitualHistorico,
}: QuestionPromptInput): string {
  const ragContext = contexto?.trim()
    ? `
MATERIAL DE REFERÊNCIA:
---
${contexto.trim()}
---

Use prioritariamente o material de referência acima.
Não atribua ao material informações que não estejam nele.
`
    : `
Nenhum material RAG foi fornecido nesta solicitação.
Use conhecimento técnico consolidado e evite informações incertas.
`

  const diversityContext = enunciadosAnteriores.length > 0
    ? `
QUESTÕES JÁ EXISTENTES NESTE MESMO CONTEXTO:
${enunciadosAnteriores.map((statement, index) => `${index + 1}. ${statement}`).join('\n')}

Antes de criar o lote, identifique mentalmente o conceito central cobrado por cada questão anterior.
As questões acima são fornecidas somente para promover diversidade.
Não copie, não faça simples paráfrase e evite repetir excessivamente os conceitos já explorados quando houver outros pontos relevantes.
`
    : `
Não há questões anteriores disponíveis para comparação neste contexto.
`

  const answerPlan = planoGabaritos.length === quantidade
    ? planoGabaritos.map((letter, index) => `${index + 1}: ${letter}`).join(', ')
    : ''

  const retryFeedback = feedbackDiversidade?.trim()
    ? `
CORREÇÃO OBRIGATÓRIA DA TENTATIVA ANTERIOR:
${feedbackDiversidade.trim()}
Produza um lote novo corrigindo especificamente essa repetição.
`
    : ''

  const conceptMap = mapaConceitualHistorico?.conceitos.length
    ? `
MAPA DOS CONCEITOS RECENTEMENTE COBRADOS:
${mapaConceitualHistorico.conceitos.map((concept) => `- ${concept.nome} — ${concept.ocorrencias} ocorrência(s)`).join('\n')}

REGRAS DO MAPA:
1. Conceitos com mais ocorrências estão mais saturados.
2. Priorize conceitos ainda não explorados ou pouco explorados no assunto.
3. Não crie apenas um novo cenário para um conceito saturado.
4. Reutilize conceito saturado somente se a variedade real do assunto for insuficiente.
5. Mesmo nesse caso, varie também a abordagem cognitiva.
6. Se o conceito da nova questão for semanticamente equivalente a um conceito já presente no mapa histórico, utilize exatamente o mesmo nome canônico do mapa.
`
    : ''

  return `
Você é um professor especialista em preparação para concursos públicos brasileiros.

Sua tarefa é elaborar ${quantidade} questões inéditas.

CONFIGURAÇÃO:
- Disciplina: ${disciplina}
- Assunto: ${assunto}
- Banca: ${banca}
- Dificuldade: ${dificuldade}
- Quantidade: ${quantidade}

${ragContext}

${diversityContext}

${conceptMap}

${retryFeedback}

DIVERSIDADE:
- As questões deste lote também devem ser diferentes entre si.
- Evite repetir situação-problema, estrutura lógica, exemplo, conceito específico, pegadinha ou construção de alternativas.
- Sempre que o assunto permitir, distribua o lote entre aspectos diferentes do conteúdo, sem excluir o tema principal.
- Não produza enunciados semanticamente equivalentes.
- Não considere uma questão nova apenas porque mudou a pergunta final, personagem, objeto ou cenário. Se premissas, estrutura lógica, operação, regra ou caminho de resolução forem essencialmente os mesmos de uma questão histórica, trate-a como repetição.
- Para cada questão, identifique dinamicamente um conceito central e uma abordagem cognitiva; não use lista fixa de uma disciplina.
- Quando o assunto permitir, use um conceito central diferente em cada questão.
- Se o assunto for realmente estreito, um conceito pode reaparecer, mas a abordagem cognitiva deve ser diferente.

ESTILO DA BANCA:
Adapte redação, extensão, nível de interpretação e tipo de cobrança ao estilo característico da banca ${banca}.

Não copie literalmente questões existentes.
Não mencione que a questão foi criada por inteligência artificial.
Não invente leis, normas, artigos, súmulas, conceitos técnicos ou referências.
Evite ambiguidades.
Deve existir apenas uma alternativa correta.

ALTERNATIVAS:
Cada questão deve possuir exatamente cinco alternativas:
A, B, C, D e E.

GABARITO:
O campo "gabarito" deve conter exclusivamente:
"A", "B", "C", "D" ou "E".
${answerPlan ? `
Plano de posições corretas deste lote: ${answerPlan}.
Construa cada questão desde o início para que a alternativa correta ocupe a posição indicada.
Não altere apenas a letra do gabarito: o texto correto deve estar na alternativa correspondente.
O plano foi embaralhado para equilibrar A-E sem criar sequência previsível.
` : ''}

EXPLICAÇÃO:
Explique objetivamente por que a alternativa correta está correta.
Quando relevante, explique também a principal pegadinha das alternativas incorretas.

FORMATO DE SAÍDA:

Retorne SOMENTE JSON válido.

Não use Markdown.
Não use blocos de código.
Não escreva texto antes ou depois do JSON.

Utilize exatamente esta estrutura:

{
  "assunto_estreito": false,
  "questoes": [
    {
      "enunciado": "texto da questão",
      "alternativa_a": "alternativa A",
      "alternativa_b": "alternativa B",
      "alternativa_c": "alternativa C",
      "alternativa_d": "alternativa D",
      "alternativa_e": "alternativa E",
      "gabarito": "A",
      "explicacao": "explicação fundamentada",
      "conceito_central": "conceito efetivamente cobrado, identificado dinamicamente",
      "abordagem_cognitiva": "forma de cobrança usada, identificada dinamicamente"
    }
  ]
}

O array "questoes" deve conter exatamente ${quantidade} itens.
Use "assunto_estreito": true somente quando a variedade conceitual razoável do assunto for menor que a quantidade solicitada.
`.trim()
}
