const GROQ_API_URL =
  'https://api.groq.com/openai/v1/chat/completions'

const DEFAULT_GROQ_MODEL =
  'openai/gpt-oss-120b'

export type GroqResponseFormat =
  | 'json'
  | 'text'

interface GroqGenerateOptions {
  prompt: string
  temperature?: number
  maxOutputTokens?: number
  responseFormat?: GroqResponseFormat
  onMetadata?: (metadata: { finishReason?: string; status?: number }) => void
}

interface GroqResponse {
  choices?: Array<{
    finish_reason?: string
    message?: {
      content?: string
    }
  }>
  error?: {
    message?: string
  }
}

export async function generateWithGroq({
  prompt,
  temperature = 0.4,
  maxOutputTokens = 8192,
  responseFormat = 'json',
  onMetadata,
}: GroqGenerateOptions): Promise<string> {
  const apiKey =
    process.env.GROQ_API_KEY?.trim()

  if (!apiKey) {
    throw new Error(
      'GROQ_API_KEY não configurada.',
    )
  }

  const model =
    process.env.GROQ_MODEL?.trim() ||
    DEFAULT_GROQ_MODEL

  const controller =
    new AbortController()

  const timeout =
    setTimeout(
      () => controller.abort(),
      45000,
    )

  try {
    const body: Record<string, unknown> = {
      model,

      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],

      temperature,

      max_completion_tokens:
        maxOutputTokens,
    }

    /*
     * Geração de questões precisa obrigatoriamente
     * retornar JSON.
     *
     * Explicação, resumo, aula e pergunta livre
     * retornam texto/Markdown e NÃO devem usar
     * json_object.
     */
    if (responseFormat === 'json') {
      body.response_format = {
        type: 'json_object',
      }
    }

    const response =
      await fetch(
        GROQ_API_URL,
        {
          method: 'POST',

          headers: {
            Authorization:
              `Bearer ${apiKey}`,

            'Content-Type':
              'application/json',
          },

          body:
            JSON.stringify(body),

          signal:
            controller.signal,

          cache:
            'no-store',
        },
      )

    const data =
      (await response.json()) as GroqResponse

    onMetadata?.({
      finishReason: data.choices?.[0]?.finish_reason,
      status: response.status,
    })

    if (!response.ok) {
      throw new Error(
        data.error?.message ||
          `Groq respondeu HTTP ${response.status}.`,
      )
    }

    const text =
      data
        .choices?.[0]
        ?.message
        ?.content
        ?.trim()

    if (!text) {
      throw new Error(
        'Groq retornou uma resposta vazia.',
      )
    }

    return text
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'AbortError'
    ) {
      throw new Error(
        'Timeout ao consultar o Groq.',
      )
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }
}
