import { generateWithGemini } from './gemini'
import { generateWithGroq } from './groq'

export type AiProvider = 'gemini' | 'groq'
export interface AiResponseMetadata { finishReason?: string; status?: number }
export interface ProviderOptions {
  prompt: string
  temperature?: number
  maxOutputTokens?: number
  onMetadata?: (metadata: AiResponseMetadata) => void
}
export interface QuestionProviders {
  gemini: (options: ProviderOptions) => Promise<string>
  groq: (options: ProviderOptions) => Promise<string>
}

export const defaultQuestionProviders: QuestionProviders = { gemini: generateWithGemini, groq: generateWithGroq }

export async function generateJsonWithFallback(
  prompt: string,
  providers: QuestionProviders = defaultQuestionProviders,
  options: { temperature?: number; maxOutputTokens?: number; operation?: string; stage?: string } = {},
): Promise<{ rawResponse: string; provider: AiProvider; metadata?: AiResponseMetadata }> {
  let metadata: AiResponseMetadata | undefined
  const request = {
    prompt,
    temperature: options.temperature ?? 0.4,
    maxOutputTokens: options.maxOutputTokens ?? 8192,
    onMetadata: (value: AiResponseMetadata) => { metadata = value },
  }
  try {
    return { rawResponse: await providers.gemini(request), provider: 'gemini', metadata }
  } catch (geminiError) {
    if (options.stage) console.warn(`[AI][${options.stage}][gemini] provider_error`)
    console.warn(`[AI] Gemini indisponível em ${options.operation ?? 'geração'}. Tentando Groq.`, geminiError instanceof Error ? geminiError.message : 'Erro desconhecido')
    try {
      metadata = undefined
      return { rawResponse: await providers.groq(request), provider: 'groq', metadata }
    } catch (groqError) {
      if (options.stage) console.error(`[AI][${options.stage}][groq] provider_error`)
      const geminiMessage = geminiError instanceof Error ? geminiError.message : 'Erro desconhecido'
      const groqMessage = groqError instanceof Error ? groqError.message : 'Erro desconhecido'
      throw new Error(`Nenhum provedor de IA conseguiu responder. Gemini: ${geminiMessage} | Groq: ${groqMessage}`)
    }
  }
}
