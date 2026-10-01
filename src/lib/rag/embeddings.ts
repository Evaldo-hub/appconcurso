import 'server-only'

import { RAG_CONFIG } from './config'
import {
  createEmbeddingRateLimitTelemetry,
  EmbeddingSlidingWindowRateLimiter,
  estimateEmbeddingInputTokens,
  splitEmbeddingBatchByTokenBudget,
  type EmbeddingRateLimitConfig,
  type EmbeddingRateLimitTelemetry,
} from './embedding-rate-limiter'
import type { RagEmbedding, RagEmbeddingRequest } from './types'

export interface RagEmbeddingProviderClient {
  embed(requests: readonly RagEmbeddingRequest[]): Promise<RagEmbedding[]>
}

interface GoogleEmbeddingClientOptions {
  apiKey: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  sleep?: (delayMs: number) => Promise<void>
  random?: () => number
  now?: () => number
  rateLimitConfig?: EmbeddingRateLimitConfig
  telemetry?: EmbeddingRateLimitTelemetry
}

interface GoogleBatchResponse {
  embeddings?: Array<{ values?: unknown }>
}

export interface GoogleEmbeddingQuotaViolation {
  subject?: string
  description?: string
  quotaMetric?: string
  quotaId?: string
  quotaDimensions?: Record<string, string>
}

export interface GoogleEmbeddingErrorDiagnostics {
  httpStatus: number
  googleCode?: number
  googleStatus?: string
  googleMessage?: string
  reason?: string
  quotaViolations?: GoogleEmbeddingQuotaViolation[]
  retryDelay?: string
  retryAfter?: string
}

export class RagEmbeddingProviderError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
    readonly httpStatus?: number,
    readonly diagnostics?: GoogleEmbeddingErrorDiagnostics,
  ) {
    super(message)
    this.name = 'RagEmbeddingProviderError'
  }
}

export type RagEmbeddingErrorClassification =
  | 'DAILY_QUOTA_EXHAUSTED'
  | 'RATE_LIMIT_RETRYABLE'
  | 'NON_RETRYABLE_PROVIDER_ERROR'

const DAILY_QUOTA_METRIC = 'generativelanguage.googleapis.com/embed_content_free_tier_requests'
const DAILY_QUOTA_ID = 'EmbedContentRequestsPerDayPerUserPerProjectPerModel-FreeTier'

export function isDailyEmbeddingQuotaExhausted(error: unknown): boolean {
  if (!(error instanceof RagEmbeddingProviderError)) return false
  return error.diagnostics?.quotaViolations?.some((violation) =>
    violation.quotaMetric === DAILY_QUOTA_METRIC || violation.quotaId === DAILY_QUOTA_ID,
  ) ?? false
}

export function classifyEmbeddingProviderError(error: unknown): RagEmbeddingErrorClassification | null {
  if (!(error instanceof RagEmbeddingProviderError)) return null
  if (isDailyEmbeddingQuotaExhausted(error)) return 'DAILY_QUOTA_EXHAUSTED'
  return error.retryable ? 'RATE_LIMIT_RETRYABLE' : 'NON_RETRYABLE_PROVIDER_ERROR'
}

const RETRY_POLICY = Object.freeze({
  maxAttempts: 5,
  baseDelayMs: 2_000,
  maxDelayMs: 30_000,
  retryableStatuses: new Set([408, 429, 500, 502, 503, 504]),
})

const DIAGNOSTIC_MESSAGE_LIMIT = 750

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizeDiagnosticText(value: unknown, apiKey: string): string | undefined {
  if (typeof value !== 'string') return undefined
  let sanitized = value
  if (apiKey) sanitized = sanitized.replaceAll(apiKey, '[REDACTED]')
  sanitized = sanitized
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED]')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/((?:x-goog-api-key|authorization|access[_ -]?token|api[_ -]?key|credential|token)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
  return sanitized ? sanitized.slice(0, DIAGNOSTIC_MESSAGE_LIMIT) : undefined
}

function safeHeaderValue(response: Response, name: string, apiKey: string) {
  return sanitizeDiagnosticText(response.headers.get(name), apiKey)
}

async function googleErrorDiagnostics(response: Response, apiKey: string): Promise<GoogleEmbeddingErrorDiagnostics> {
  const diagnostics: GoogleEmbeddingErrorDiagnostics = { httpStatus: response.status }
  diagnostics.retryAfter = safeHeaderValue(response, 'retry-after', apiKey)

  let rawBody: string
  try {
    rawBody = await response.text()
  } catch {
    return diagnostics
  }
  if (!rawBody.trim()) return diagnostics

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    diagnostics.googleMessage = sanitizeDiagnosticText(rawBody, apiKey)
    return diagnostics
  }
  if (!isRecord(parsed)) return diagnostics

  const googleError = isRecord(parsed.error) ? parsed.error : parsed
  if (typeof googleError.code === 'number' && Number.isFinite(googleError.code)) diagnostics.googleCode = googleError.code
  diagnostics.googleStatus = sanitizeDiagnosticText(googleError.status, apiKey)
  diagnostics.googleMessage = sanitizeDiagnosticText(googleError.message, apiKey)
  diagnostics.reason = sanitizeDiagnosticText(googleError.reason, apiKey)

  const violations: GoogleEmbeddingQuotaViolation[] = []
  const details = Array.isArray(googleError.details) ? googleError.details : []
  for (const detail of details) {
    if (!isRecord(detail)) continue
    const detailType = typeof detail['@type'] === 'string' ? detail['@type'] : ''
    if (detailType.includes('ErrorInfo')) diagnostics.reason ??= sanitizeDiagnosticText(detail.reason, apiKey)
    if (detailType.includes('RetryInfo')) diagnostics.retryDelay ??= sanitizeDiagnosticText(detail.retryDelay, apiKey)
    if (!detailType.includes('QuotaFailure') || !Array.isArray(detail.violations)) continue
    for (const value of detail.violations) {
      if (!isRecord(value) || violations.length >= 20) continue
      const quotaDimensions = isRecord(value.quotaDimensions)
        ? Object.fromEntries(Object.entries(value.quotaDimensions).slice(0, 20).flatMap(([key, dimension]) => {
          const sanitizedKey = sanitizeDiagnosticText(key, apiKey)
          const sanitizedValue = sanitizeDiagnosticText(dimension, apiKey)
          return sanitizedKey && sanitizedValue ? [[sanitizedKey, sanitizedValue]] : []
        }))
        : undefined
      violations.push({
        subject: sanitizeDiagnosticText(value.subject, apiKey),
        description: sanitizeDiagnosticText(value.description, apiKey),
        quotaMetric: sanitizeDiagnosticText(value.quotaMetric, apiKey),
        quotaId: sanitizeDiagnosticText(value.quotaId, apiKey),
        quotaDimensions: quotaDimensions && Object.keys(quotaDimensions).length > 0 ? quotaDimensions : undefined,
      })
    }
  }
  if (violations.length > 0) diagnostics.quotaViolations = violations
  return diagnostics
}

function defaultSleep(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs))
}

function retryAfterMs(response: Response, nowMs = Date.now()): number | null {
  const value = response.headers.get('retry-after')?.trim()
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, RETRY_POLICY.maxDelayMs)
  const date = Date.parse(value)
  if (!Number.isFinite(date)) return null
  return Math.min(Math.max(0, date - nowMs), RETRY_POLICY.maxDelayMs)
}

function backoffDelayMs(attempt: number, random: () => number) {
  const exponential = Math.min(RETRY_POLICY.baseDelayMs * 2 ** (attempt - 1), RETRY_POLICY.maxDelayMs)
  const jitter = Math.max(0, Math.min(1, random())) * Math.min(1_000, exponential * 0.25)
  return Math.min(exponential + jitter, RETRY_POLICY.maxDelayMs)
}

function embeddingText(request: RagEmbeddingRequest) {
  if (request.taskType === 'RETRIEVAL_QUERY') return `task: search result | query: ${request.content}`
  return request.title
    ? `title: ${request.title} | text: ${request.content}`
    : `title: none | text: ${request.content}`
}

function parseValues(value: unknown): number[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'number')) {
    throw new RagEmbeddingProviderError('O provedor retornou um embedding inválido.')
  }
  return value as number[]
}

export function createGoogleEmbeddingClient(options: GoogleEmbeddingClientOptions): RagEmbeddingProviderClient {
  const apiKey = options.apiKey.trim()
  if (!apiKey) throw new Error('Chave Gemini não configurada no servidor.')
  const fetchImpl = options.fetchImpl ?? fetch
  const config = RAG_CONFIG.embedding
  const modelResource = `models/${config.model}`
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/${modelResource}:batchEmbedContents`
  const sleep = options.sleep ?? defaultSleep
  const random = options.random ?? Math.random
  const telemetry = options.telemetry ?? createEmbeddingRateLimitTelemetry()
  const rateLimiter = new EmbeddingSlidingWindowRateLimiter(
    options.rateLimitConfig ?? RAG_CONFIG.embeddingRateLimit,
    telemetry,
    options.now ?? Date.now,
    sleep,
  )

  return {
    async embed(requests) {
      const results: RagEmbedding[] = []
      for (let offset = 0; offset < requests.length; offset += config.batchSize) {
        const logicalBatch = requests.slice(offset, offset + config.batchSize)
        telemetry.logicalBatches += 1
        const subBatches = splitEmbeddingBatchByTokenBudget(
          logicalBatch,
          (request) => estimateEmbeddingInputTokens(embeddingText(request)),
          rateLimiter.limits.tokens,
        )
        telemetry.subBatchesCreated += Math.max(0, subBatches.length - 1)
        for (const batch of subBatches) {
          const texts = batch.map(embeddingText)
          const estimatedBatchTokens = texts.reduce((total, text) => total + estimateEmbeddingInputTokens(text), 0)
          const body = JSON.stringify({
            requests: batch.map((request, index) => ({
              model: modelResource,
              content: { parts: [{ text: texts[index] }] },
              embedContentConfig: { outputDimensionality: config.dimensions },
            })),
          })

          for (let attempt = 1; attempt <= RETRY_POLICY.maxAttempts; attempt += 1) {
            let retryDelay: number | null = null
            try {
              await rateLimiter.acquire(estimatedBatchTokens)
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? config.timeoutMs)
            let response: Response
            try {
              response = await fetchImpl(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                body,
                cache: 'no-store',
                signal: controller.signal,
              })
            } catch (error) {
              if (error instanceof Error && error.name === 'AbortError') throw new RagEmbeddingProviderError('Tempo limite excedido ao gerar embeddings.', true)
              throw new RagEmbeddingProviderError('Falha de comunicação com o provedor de embeddings.', true)
            } finally {
              clearTimeout(timeout)
            }

            if (!response.ok) {
              const retryable = RETRY_POLICY.retryableStatuses.has(response.status)
              retryDelay = retryable ? retryAfterMs(response) : null
              const diagnostics = await googleErrorDiagnostics(response, apiKey)
                .catch((): GoogleEmbeddingErrorDiagnostics => ({ httpStatus: response.status }))
              throw new RagEmbeddingProviderError(`O provedor de embeddings recusou a requisição (${response.status}).`, retryable, response.status, diagnostics)
            }
            const payload = await response.json() as GoogleBatchResponse
            if (!payload.embeddings || payload.embeddings.length !== batch.length) throw new RagEmbeddingProviderError('O provedor retornou uma quantidade inesperada de embeddings.')
            results.push(...payload.embeddings.map((item) => validateRagEmbedding({
              values: parseValues(item.values),
              provider: config.provider,
              model: config.model,
              dimensions: config.dimensions,
            })))
              break
            } catch (error) {
              if (isDailyEmbeddingQuotaExhausted(error)) throw error
              if (!(error instanceof RagEmbeddingProviderError) || !error.retryable || attempt >= RETRY_POLICY.maxAttempts) throw error
              await sleep(retryDelay ?? backoffDelayMs(attempt, random))
            }
          }
        }
      }
      return results
    },
  }
}

export function validateRagEmbedding(embedding: RagEmbedding): RagEmbedding {
  const expected = RAG_CONFIG.embedding
  if (embedding.provider !== expected.provider || embedding.model !== expected.model) throw new Error('O embedding não corresponde ao provider/modelo do RAG-V2.')
  if (embedding.dimensions !== expected.dimensions || embedding.values.length !== expected.dimensions) throw new Error(`O embedding deve possuir exatamente ${expected.dimensions} dimensões.`)
  if (embedding.values.some((value) => !Number.isFinite(value))) throw new Error('O embedding contém valores inválidos.')
  return embedding
}

export function createUnconfiguredEmbeddingClient(): RagEmbeddingProviderClient {
  return {
    async embed() {
      throw new Error('A geração de embeddings do RAG-V2 ainda não está habilitada.')
    },
  }
}
