import type { AiProvider, AiResponseMetadata } from './provider-fallback'

export type AiJsonStage =
  | 'question_generation'
  | 'semantic_validation'
  | 'question_correction'
  | 'semantic_revalidation'

const DIAGNOSTIC_EXCERPT_LENGTH = 180

function excerpt(value: string, fromEnd = false): string {
  const normalized = value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return fromEnd
    ? normalized.slice(-DIAGNOSTIC_EXCERPT_LENGTH)
    : normalized.slice(0, DIAGNOSTIC_EXCERPT_LENGTH)
}

export function parseAiJson(
  rawResponse: string,
  stage: AiJsonStage,
  provider: AiProvider,
  metadata?: AiResponseMetadata,
): unknown {
  try {
    return JSON.parse(rawResponse)
  } catch {
    console.error(`[AI][${stage}][${provider}] invalid_json`)

    if (process.env.NODE_ENV === 'development') {
      console.error(`[AI][${stage}][${provider}] invalid_json_diagnostic`, {
        responseLength: rawResponse.length,
        responseStart: excerpt(rawResponse),
        responseEnd: excerpt(rawResponse, true),
        finishReason: metadata?.finishReason ?? 'not_available',
        status: metadata?.status ?? 'not_available',
      })
    }

    throw new Error(`${provider} retornou JSON inválido.`)
  }
}
