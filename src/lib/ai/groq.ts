const GROQ_API_URL =
  'https://api.groq.com/openai/v1/chat/completions'

export const DEFAULT_GROQ_MODEL =
  'openai/gpt-oss-120b'

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504])

export class GroqGenerationError extends Error {
  constructor(
    message: string,
    readonly details: { model: string; httpStatus?: number; retryable: boolean },
  ) {
    super(message)
    this.name = 'GroqGenerationError'
  }
}

export function getConfiguredGroqModel() {
  return process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL
}

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

  const model = getConfiguredGroqModel()

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
      (await response.json().catch(() => null)) as GroqResponse | null

    onMetadata?.({
      finishReason: data?.choices?.[0]?.finish_reason,
      status: response.status,
    })

    if (!response.ok) {
      throw new GroqGenerationError(
        sanitizeGroqError(data?.error?.message || `Groq respondeu HTTP ${response.status}.`, apiKey, prompt),
        { model, httpStatus: response.status, retryable: RETRYABLE_STATUSES.has(response.status) },
      )
    }

    const text =
      data
        ?.choices?.[0]
        ?.message
        ?.content
        ?.trim()

    if (!text) {
      throw new GroqGenerationError(
        'Groq retornou uma resposta vazia.',
        { model, httpStatus: response.status, retryable: true },
      )
    }

    return text
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'AbortError'
    ) {
      throw new GroqGenerationError(
        'Timeout ao consultar o Groq.',
        { model, retryable: true },
      )
    }
    if (error instanceof GroqGenerationError) throw error
    throw new GroqGenerationError(
      error instanceof Error ? sanitizeGroqError(error.message, apiKey, prompt) : 'Erro de comunicação com o Groq.',
      { model, retryable: true },
    )
  } finally {
    clearTimeout(timeout)
  }
}

function sanitizeGroqError(message: string, apiKey: string, prompt: string) {
  return message
    .split(apiKey).join('[REDACTED]')
    .split(prompt).join('[PROMPT_REDACTED]')
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
}
