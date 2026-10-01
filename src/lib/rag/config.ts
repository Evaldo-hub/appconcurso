import 'server-only'

import type { RagEmbeddingConfig } from './types'

export const RAG_CONFIG = Object.freeze({
  ingestionVersion: 'rag-v2',
  chunkingVersion: 'semantic-v1',
  embedding: Object.freeze({
    provider: 'google',
    model: 'gemini-embedding-2',
    dimensions: 768,
    batchSize: 32,
    timeoutMs: 45_000,
  }) satisfies RagEmbeddingConfig,
  embeddingRateLimit: Object.freeze({
    rpmLimit: 100,
    tpmLimit: 30_000,
    rpmUtilization: 0.80,
    tpmUtilization: 0.80,
    windowMs: 60_000,
    waitMarginMs: 25,
  }),
  chunking: Object.freeze({
    targetTokens: 700,
    maxTokens: 1000,
    maxOverlapTokens: 100,
    approximateCharactersPerToken: 4,
  }),
  retrieval: Object.freeze({
    defaultLimit: 8,
    maxLimit: 20,
    defaultThreshold: 0.65,
  }),
  download: Object.freeze({
    maxBytes: 25 * 1024 * 1024,
    timeoutMs: 30_000,
  }),
  persistence: Object.freeze({
    insertBatchSize: 100,
  }),
})

export class RagGitHubConfigError extends Error {
  constructor() {
    super('RAG_GITHUB_CONFIG_MISSING')
    this.name = 'RagGitHubConfigError'
  }
}

export function getRagGitHubConfig() {
  const owner = process.env.RAG_GITHUB_OWNER?.trim()
  const repository = process.env.RAG_GITHUB_REPOSITORY?.trim()
  const ref = process.env.RAG_GITHUB_REF?.trim()
  const token = process.env.RAG_GITHUB_TOKEN?.trim()
  if (!owner || !repository || !ref || !token) {
    console.error('[RAG_GITHUB_CONFIG_MISSING]', {
      ownerPresent: Boolean(owner),
      repositoryPresent: Boolean(repository),
      refPresent: Boolean(ref),
      tokenPresent: Boolean(token),
    })
    throw new RagGitHubConfigError()
  }
  return { owner, repository, ref, token }
}

export function getRagServerConfig() {
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim()
  if (!geminiApiKey) throw new Error('Chave Gemini não configurada no servidor.')

  return {
    repository: getRagGitHubConfig(),
    geminiApiKey,
  }
}
