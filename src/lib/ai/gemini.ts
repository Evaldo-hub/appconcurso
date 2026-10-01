const GEMINI_API_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models'

const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash'
const MAX_ATTEMPTS_PER_MODEL = 3
const BASE_DELAY_MS = 2_000
const MAX_DELAY_MS = 30_000
const JITTER_MAX_MS = 500
const REQUEST_TIMEOUT_MS = 45_000
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504])
const PERMANENT_STATUSES = new Set([400, 401, 403, 404])

const FALLBACK_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
] as const

export type GeminiFallbackPolicy = 'allow' | 'forbid'

export interface GeminiGenerationTelemetry {
  requestedModel: string
  effectiveModel: string
  attempts: number
  fallbackUsed: boolean
}

export interface GeminiGenerateOptions {
  prompt: string
  temperature?: number
  maxOutputTokens?: number
  responseFormat?: 'json' | 'text'
  onMetadata?: (metadata: { finishReason?: string; status?: number; model: string }) => void
  onTelemetry?: (telemetry: GeminiGenerationTelemetry) => void
  fallbackPolicy?: GeminiFallbackPolicy
  retryDependencies?: Partial<GeminiRetryDependencies>
}

export class GeminiGenerationError extends Error {
  readonly requestedModel: string
  readonly effectiveModel: string
  readonly attempts: number
  readonly fallbackUsed: false
  readonly httpStatus?: number
  readonly finishReason?: string

  constructor(message: string, details: Omit<GeminiGenerationTelemetry, 'fallbackUsed'> & { httpStatus?: number; finishReason?: string }) {
    super(message)
    this.name = 'GeminiGenerationError'
    this.requestedModel = details.requestedModel
    this.effectiveModel = details.effectiveModel
    this.attempts = details.attempts
    this.fallbackUsed = false
    this.httpStatus = details.httpStatus
    this.finishReason = details.finishReason
  }
}

export function getConfiguredGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL
}

interface GeminiRetryDependencies {
  sleep: (delayMs: number) => Promise<void>
  random: () => number
  now: () => number
}

interface GeminiResponse {
  candidates?: Array<{
    finishReason?: string
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
  error?: {
    message?: string
  }
}

interface GeminiAttemptResult {
  text?: string
  retryable: boolean
  error?: string
  retryAfterMs?: number
  httpStatus?: number
  finishReason?: string
}

const defaultRetryDependencies: GeminiRetryDependencies = {
  sleep: (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  random: Math.random,
  now: Date.now,
}

export async function generateWithGemini({
  prompt,
  temperature = 0.4,
  maxOutputTokens = 8192,
  responseFormat = 'json',
  onMetadata,
  onTelemetry,
  fallbackPolicy = 'allow',
  retryDependencies,
}: GeminiGenerateOptions): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY nÃ£o configurada.')
  }

  const configuredModel = getConfiguredGeminiModel()

  const models = fallbackPolicy === 'forbid'
    ? [configuredModel]
    : Array.from(new Set([configuredModel, ...FALLBACK_MODELS]))

  const errors: string[] = []
  const retry = { ...defaultRetryDependencies, ...retryDependencies }

  let attempts = 0
  let effectiveModel = configuredModel
  let lastResult: GeminiAttemptResult | undefined
  for (const model of models) {
    effectiveModel = model
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt += 1) {
      attempts += 1
      const result = await tryGenerate({
        apiKey,
        model,
        prompt,
        temperature,
        maxOutputTokens,
        responseFormat,
        onMetadata,
        now: retry.now,
      })
      lastResult = result

      if (result.text) {
        onTelemetry?.({ requestedModel: configuredModel, effectiveModel: model, attempts, fallbackUsed: model !== configuredModel })
        return result.text
      }
      if (!result.retryable) {
        const message = result.error || 'Falha ao acessar o Gemini.'
        if (fallbackPolicy === 'forbid') {
          throw new GeminiGenerationError(message, {
            requestedModel: configuredModel,
            effectiveModel: model,
            attempts,
            httpStatus: result.httpStatus,
            finishReason: result.finishReason,
          })
        }
        throw new Error(message)
      }

      if (attempt === MAX_ATTEMPTS_PER_MODEL) {
        errors.push(`${model}: ${result.error ?? 'erro transitório'}`)
        break
      }

      const exponentialDelay = BASE_DELAY_MS * (2 ** (attempt - 1))
      const delayMs = result.retryAfterMs ?? Math.min(
        exponentialDelay + Math.floor(retry.random() * JITTER_MAX_MS),
        MAX_DELAY_MS,
      )
      await retry.sleep(delayMs)
    }
  }

  const message = `Nenhum modelo Gemini conseguiu responder. ${errors.join(' | ')}`
  if (fallbackPolicy === 'forbid') {
    throw new GeminiGenerationError(message, {
      requestedModel: configuredModel,
      effectiveModel,
      attempts,
      httpStatus: lastResult?.httpStatus,
      finishReason: lastResult?.finishReason,
    })
  }
  throw new Error(message)
}

async function tryGenerate({
  apiKey,
  model,
  prompt,
  temperature,
  maxOutputTokens,
  responseFormat,
  onMetadata,
  now,
}: {
  apiKey: string
  model: string
  prompt: string
  temperature: number
  maxOutputTokens: number
  responseFormat: 'json' | 'text'
  onMetadata?: (metadata: { finishReason?: string; status?: number; model: string }) => void
  now: () => number
}): Promise<GeminiAttemptResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(
      `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature,
            maxOutputTokens,
            ...(responseFormat === 'json' ? { responseMimeType: 'application/json' } : {}),
          },
        }),
      },
    )

    const data =
      (await response.json().catch(() => null)) as GeminiResponse | null

    onMetadata?.({
      finishReason: data?.candidates?.[0]?.finishReason,
      status: response.status,
      model,
    })

    if (!response.ok) {
      const message =
        data?.error?.message ||
        `Gemini retornou HTTP ${response.status}.`

      return {
        retryable: isRetryableError(response.status, message),
        error: sanitizeError(message, { apiKey, prompt }),
        retryAfterMs: parseRetryAfter(response.headers.get('Retry-After'), now()),
        httpStatus: response.status,
        finishReason: data?.candidates?.[0]?.finishReason,
      }
    }

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim()

    if (!text) {
      return {
        retryable: true,
        error: 'Gemini retornou uma resposta vazia.',
        httpStatus: response.status,
        finishReason: data?.candidates?.[0]?.finishReason,
      }
    }

    return {
      text,
      retryable: false,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        retryable: true,
        error: 'Tempo limite excedido.',
      }
    }

    return {
      retryable: true,
      error:
        error instanceof Error
          ? sanitizeError(error.message, { apiKey, prompt })
          : 'Erro de comunicaÃ§Ã£o com o Gemini.',
    }
  } finally {
    clearTimeout(timeout)
  }
}

function isRetryableError(status: number, message: string): boolean {
  if (PERMANENT_STATUSES.has(status)) return false
  if (RETRYABLE_STATUSES.has(status)) return true

  const normalized = message.toLowerCase()

  return (
    normalized.includes('high demand') ||
    normalized.includes('temporarily unavailable') ||
    normalized.includes('overloaded') ||
    normalized.includes('resource exhausted')
  )
}

function parseRetryAfter(value: string | null, nowMs: number): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.round(seconds * 1_000), MAX_DELAY_MS)
  }
  const dateMs = Date.parse(value)
  if (!Number.isFinite(dateMs)) return undefined
  return Math.min(Math.max(0, dateMs - nowMs), MAX_DELAY_MS)
}

function sanitizeError(message: string, sensitive: { apiKey: string; prompt: string }) {
  return message
    .replace(/https?:\/\/[^\s]*[?&]key=[^\s]*/gi, '[URL_REDACTED]')
    .split(sensitive.apiKey).join('[REDACTED]')
    .split(encodeURIComponent(sensitive.apiKey)).join('[REDACTED]')
    .split(sensitive.prompt).join('[PROMPT_REDACTED]')
    .replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]')
}


