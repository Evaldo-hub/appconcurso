import { GeminiGenerationError } from './gemini'
import { GroqGenerationError } from './groq'

const FALLBACK_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504])

export interface GeminiGroqResult {
  model: string
}

export interface ProviderFailureDetails {
  provider: 'gemini' | 'groq'
  status?: number
  errorName: string
  attempted?: boolean
}

export interface GeminiGroqFallbackDependencies<T extends GeminiGroqResult> {
  scope: 'QUESTION_AI' | 'SEMANTIC_AI'
  primary: (prompt: string) => Promise<T>
  fallback: (prompt: string) => Promise<T>
  createUnavailableError: (primary: ProviderFailureDetails, fallback: ProviderFailureDetails) => Error
  sleep?: (delayMs: number) => Promise<void>
  fallbackConfigured?: () => boolean
  logger?: Pick<Console, 'info' | 'warn' | 'error'>
}

export function isGeminiGroqFallbackAllowed(error: unknown) {
  if (!(error instanceof GeminiGenerationError)) return false
  if (error.httpStatus !== undefined && FALLBACK_HTTP_STATUSES.has(error.httpStatus)) return true
  const message = error.message.toLowerCase()
  return error.httpStatus === undefined || message.includes('high demand') || message.includes('temporarily unavailable')
    || message.includes('overloaded') || message.includes('resposta vazia') || message.includes('tempo limite')
}

export function createGeminiGroqFallback<T extends GeminiGroqResult>(dependencies: GeminiGroqFallbackDependencies<T>) {
  return async function runWithProviderFallback(prompt: string): Promise<T> {
    const logger = dependencies.logger ?? console
    const prefix = `[${dependencies.scope}]`
    logger.info(`${prefix}[PRIMARY_START]`, { provider: 'gemini' })
    try {
      const result = await dependencies.primary(prompt)
      logger.info(`${prefix}[PRIMARY_SUCCESS]`, { provider: 'gemini', model: result.model })
      return result
    } catch (primaryError) {
      const fallbackAllowed = isGeminiGroqFallbackAllowed(primaryError)
      const primaryStatus = primaryError instanceof GeminiGenerationError ? primaryError.httpStatus : undefined
      const primaryDetails: ProviderFailureDetails = {
        provider: 'gemini', status: primaryStatus,
        errorName: primaryError instanceof Error ? primaryError.name : 'UnknownError',
      }
      logger.warn(`${prefix}[PRIMARY_FAILED]`, {
        provider: 'gemini', error_name: primaryDetails.errorName, http_status: primaryStatus,
        attempts: primaryError instanceof GeminiGenerationError ? primaryError.attempts : undefined,
        fallback_allowed: fallbackAllowed,
      })
      if (!fallbackAllowed) throw primaryError

      if (!(dependencies.fallbackConfigured?.() ?? Boolean(process.env.GROQ_API_KEY?.trim()))) {
        const fallbackDetails: ProviderFailureDetails = {
          provider: 'groq', errorName: 'FALLBACK_PROVIDER_NOT_CONFIGURED', attempted: false,
        }
        logger.error(`${prefix}[FALLBACK_FAILED]`, { provider: 'groq', classification: 'NOT_CONFIGURED', attempts: 0 })
        throw dependencies.createUnavailableError(primaryDetails, fallbackDetails)
      }

      logger.info(`${prefix}[FALLBACK_START]`, { provider: 'groq' })
      let fallbackError: unknown
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const result = await dependencies.fallback(prompt)
          logger.info(`${prefix}[FALLBACK_SUCCESS]`, { provider: 'groq', model: result.model, attempts: attempt })
          return result
        } catch (error) {
          fallbackError = error
          const retryable = error instanceof GroqGenerationError && error.details.retryable
          logger.warn(`${prefix}[FALLBACK_FAILED]`, {
            provider: 'groq', http_status: error instanceof GroqGenerationError ? error.details.httpStatus : undefined,
            classification: retryable ? 'RETRYABLE' : 'PERMANENT', attempts: attempt,
          })
          if (!retryable || attempt === 2) break
          await (dependencies.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs))))(500)
        }
      }
      throw dependencies.createUnavailableError(primaryDetails, {
        provider: 'groq',
        status: fallbackError instanceof GroqGenerationError ? fallbackError.details.httpStatus : undefined,
        errorName: fallbackError instanceof Error ? fallbackError.name : 'UnknownError',
        attempted: true,
      })
    }
  }
}
