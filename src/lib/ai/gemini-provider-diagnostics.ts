import 'server-only'

import { GeminiGenerationError } from './gemini'

export type StudyRagProviderStage = 'question_generation' | 'semantic_validation'

export function classifyGeminiGenerationFailure(error: unknown): 'PROVIDER_FAILURE' | 'REJECTED' {
  return error instanceof GeminiGenerationError ? 'PROVIDER_FAILURE' : 'REJECTED'
}

export function logStudyRagProviderError(stage: StudyRagProviderStage, error: unknown) {
  const structured = error instanceof GeminiGenerationError
  console.error('study_rag_provider_error', {
    stage,
    error_name: error instanceof Error ? error.name : 'UnknownProviderError',
    message: structured ? error.message : 'Provider failure without structured diagnostics.',
    requested_model: structured ? error.requestedModel : undefined,
    effective_model: structured ? error.effectiveModel : undefined,
    attempts: structured ? error.attempts : undefined,
    http_status: structured ? error.httpStatus : undefined,
    finish_reason: structured ? error.finishReason : undefined,
  })
}
