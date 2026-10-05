import 'server-only'

import { RAG_CONFIG } from './config'
import { hashRagBytes } from './hash-content'
import type { LoadedMaterialFile, RagMaterial } from './types'

export interface GitHubRepositoryConfig {
  owner: string
  repository: string
  ref: string
  token?: string
}

export type RagGitHubRequestErrorCode =
  | 'RAG_GITHUB_AUTH_FAILED'
  | 'RAG_GITHUB_PERMISSION_DENIED'
  | 'RAG_GITHUB_REPOSITORY_OR_REF_NOT_FOUND'
  | 'RAG_GITHUB_CONFLICT'
  | 'RAG_GITHUB_VALIDATION_FAILED'
  | 'RAG_GITHUB_UPLOAD_FAILED'

export type RagGitHubDiagnosticKind =
  | 'GITHUB_PREFLIGHT_FAILED'
  | 'GITHUB_UPLOAD_FAILED'
  | 'GITHUB_UPLOAD_REJECTED'
  | 'GITHUB_TARGET_EXISTS'

export type RagGitHubRequestStage = 'preflight' | 'upload'

export class RagGitHubRequestError extends Error {
  constructor(
    readonly code: RagGitHubRequestErrorCode,
    readonly status: number,
    readonly githubMessage: string | null,
    readonly documentationUrl: string | null,
    readonly stage: RagGitHubRequestStage = 'upload',
    readonly diagnosticKind: RagGitHubDiagnosticKind = 'GITHUB_UPLOAD_REJECTED',
    readonly statusText: string | null = null,
    readonly requestId: string | null = null,
    readonly causeCode: string | null = null,
  ) {
    super(code)
    this.name = 'RagGitHubRequestError'
  }
}

const SAFE_SEGMENT = /^[\p{L}\p{N}\p{M}\p{Pd}._(), +@-]+$/u
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F-\u009F]/u

export function validateGitHubMaterialPath(path: string): string {
  const candidate = path.trim()
  if (!candidate || candidate.startsWith('/') || candidate.startsWith('\\') || candidate.includes('\\') || CONTROL_CHARACTER.test(candidate)) {
    throw new Error('O caminho GitHub do material é inválido.')
  }
  const normalized = candidate.normalize('NFC')
  const segments = normalized.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || !SAFE_SEGMENT.test(segment))) {
    throw new Error('O caminho GitHub do material é inválido.')
  }
  return segments.join('/')
}

function encodePath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/')
}

function repositoryContentsUrl(repository: GitHubRepositoryConfig, path: string) {
  const owner = validateRepositoryPart(repository.owner, 'O proprietário')
  const repo = validateRepositoryPart(repository.repository, 'O nome')
  return `https://api.github.com/repos/${owner}/${repo}/contents/${encodePath(validateGitHubMaterialPath(path))}`
}

function githubHeaders(repository: GitHubRepositoryConfig) {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'plataforma-concursos-rag-v2',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(repository.token ? { Authorization: `Bearer ${repository.token}` } : {}),
  }
}

function validateRepositoryPart(value: string, label: string) {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new Error(`${label} do repositório GitHub é inválido.`)
  return value
}

function uploadErrorCode(status: number): RagGitHubRequestErrorCode {
  if (status === 401) return 'RAG_GITHUB_AUTH_FAILED'
  if (status === 403) return 'RAG_GITHUB_PERMISSION_DENIED'
  if (status === 404) return 'RAG_GITHUB_REPOSITORY_OR_REF_NOT_FOUND'
  if (status === 409) return 'RAG_GITHUB_CONFLICT'
  if (status === 422) return 'RAG_GITHUB_VALIDATION_FAILED'
  return 'RAG_GITHUB_UPLOAD_FAILED'
}

function sanitizeGitHubDiagnostic(value: string | null, token?: string) {
  if (value === null) return null
  let sanitized = value.replace(/authorization\s*:\s*bearer\s+\S+/gi, 'Authorization: Bearer [REDACTED]')
  if (token) sanitized = sanitized.split(token).join('[REDACTED]')
  return sanitized
}

function safeCauseCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('cause' in error)) return null
  const cause = error.cause
  if (!cause || typeof cause !== 'object' || !('code' in cause) || typeof cause.code !== 'string') return null
  return /^[A-Z0-9_-]{1,80}$/i.test(cause.code) ? cause.code : null
}

function failedGitHubNetworkRequest(error: unknown, repository: GitHubRepositoryConfig, stage: RagGitHubRequestStage) {
  const message = sanitizeGitHubDiagnostic(error instanceof Error ? error.message : 'Falha de rede no GitHub.', repository.token)
  const diagnosticKind = stage === 'preflight' ? 'GITHUB_PREFLIGHT_FAILED' : 'GITHUB_UPLOAD_FAILED'
  return new RagGitHubRequestError('RAG_GITHUB_UPLOAD_FAILED', 0, message, null, stage, diagnosticKind, null, null, safeCauseCode(error))
}

async function failedGitHubRequest(response: Response, repository: GitHubRepositoryConfig, stage: RagGitHubRequestStage) {
  let githubMessage: string | null = null
  let documentationUrl: string | null = null
  try {
    const body: unknown = await response.json()
    if (body && !Array.isArray(body) && typeof body === 'object') {
      const record = body as Record<string, unknown>
      githubMessage = typeof record.message === 'string' ? record.message : null
      documentationUrl = typeof record.documentation_url === 'string' ? record.documentation_url : null
    }
  } catch {
    // Non-JSON bodies have no safe structured fields to report.
  }
  githubMessage = sanitizeGitHubDiagnostic(githubMessage, repository.token)
  documentationUrl = sanitizeGitHubDiagnostic(documentationUrl, repository.token)
  const code = uploadErrorCode(response.status)
  const requestId = response.headers.get('x-github-request-id')
  const diagnosticKind = stage === 'preflight' ? 'GITHUB_PREFLIGHT_FAILED'
    : response.status >= 400 && response.status < 500 ? 'GITHUB_UPLOAD_REJECTED' : 'GITHUB_UPLOAD_FAILED'
  return new RagGitHubRequestError(code, response.status, githubMessage, documentationUrl, stage, diagnosticKind, response.statusText, requestId)
}

export interface GitHubRequestResult { status: number; requestId: string | null }
export interface GitHubPreflightResult extends GitHubRequestResult { exists: boolean }

export interface GitHubMaterialWriter {
  fileExists(path: string): Promise<GitHubPreflightResult>
  createFile(path: string, bytes: Uint8Array, commitMessage: string): Promise<GitHubRequestResult>
}

export interface GitHubMaterialFileCheck {
  exists: boolean
  type: string | null
}

export interface GitHubMaterialFileChecker {
  checkFile(path: string): Promise<GitHubMaterialFileCheck>
}

export function createGitHubMaterialFileChecker(
  repository: GitHubRepositoryConfig,
  fetchImpl: typeof fetch = fetch,
): GitHubMaterialFileChecker {
  const ref = repository.ref.trim()
  if (!ref || /[\r\n]/.test(ref)) throw new Error('A referência GitHub é inválida.')

  return {
    async checkFile(path) {
      if (!repository.token) throw new Error('Não foi possível validar o arquivo no GitHub.')
      const response = await fetchImpl(`${repositoryContentsUrl(repository, path)}?ref=${encodeURIComponent(ref)}`, {
        method: 'GET', headers: githubHeaders(repository), cache: 'no-store',
      })
      if (response.status === 404) return { exists: false, type: null }
      if (!response.ok) throw new Error('Não foi possível validar o arquivo no GitHub.')

      let metadata: unknown
      try { metadata = await response.json() } catch { throw new Error('Não foi possível validar o arquivo no GitHub.') }
      if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object' || !('type' in metadata) || typeof metadata.type !== 'string') {
        throw new Error('Não foi possível validar o arquivo no GitHub.')
      }
      return { exists: true, type: metadata.type }
    },
  }
}

export function createGitHubMaterialWriter(
  repository: GitHubRepositoryConfig,
  fetchImpl: typeof fetch = fetch,
): GitHubMaterialWriter {
  const ref = repository.ref.trim()
  if (!ref || /[\r\n]/.test(ref)) throw new Error('A referência GitHub é inválida.')
  return {
    async fileExists(path) {
      let response: Response
      try {
        response = await fetchImpl(`${repositoryContentsUrl(repository, path)}?ref=${encodeURIComponent(ref)}`, {
          method: 'GET', headers: githubHeaders(repository), cache: 'no-store',
        })
      } catch (error) {
        throw failedGitHubNetworkRequest(error, repository, 'preflight')
      }
      const result = { status: response.status, requestId: response.headers.get('x-github-request-id') }
      if (response.status === 404) return { exists: false, ...result }
      if (!response.ok) throw await failedGitHubRequest(response, repository, 'preflight')
      return { exists: true, ...result }
    },
    async createFile(path, bytes, commitMessage) {
      if (!repository.token) throw new Error('Credencial de escrita GitHub não configurada no servidor.')
      let response: Response
      try {
        response = await fetchImpl(repositoryContentsUrl(repository, path), {
          method: 'PUT',
          headers: { ...githubHeaders(repository), 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: commitMessage, content: Buffer.from(bytes).toString('base64'), branch: ref }),
          cache: 'no-store',
        })
      } catch (error) {
        throw failedGitHubNetworkRequest(error, repository, 'upload')
      }
      if (response.status !== 201) throw await failedGitHubRequest(response, repository, 'upload')
      return { status: response.status, requestId: response.headers.get('x-github-request-id') }
    },
  }
}

export async function loadMaterialFromGitHub(
  material: Pick<RagMaterial, 'githubPath'>,
  repository: GitHubRepositoryConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<LoadedMaterialFile> {
  const path = validateGitHubMaterialPath(material.githubPath)
  const owner = validateRepositoryPart(repository.owner, 'O proprietário')
  const repo = validateRepositoryPart(repository.repository, 'O nome')
  const ref = repository.ref.trim()
  if (!ref || /[\r\n]/.test(ref)) throw new Error('A referência GitHub é inválida.')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), RAG_CONFIG.download.timeoutMs)
  try {
    const response = await fetchImpl(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
      {
        headers: {
          Accept: 'application/vnd.github.raw+json',
          'User-Agent': 'plataforma-concursos-rag-v2',
          ...(repository.token ? { Authorization: `Bearer ${repository.token}` } : {}),
        },
        cache: 'no-store',
        signal: controller.signal,
      },
    )
    if (!response.ok) throw new Error(`Não foi possível carregar o material autorizado do GitHub (${response.status}).`)

    const declaredSize = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredSize) && declaredSize > RAG_CONFIG.download.maxBytes) throw new Error('O material excede o limite de tamanho permitido.')
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > RAG_CONFIG.download.maxBytes) throw new Error('O material excede o limite de tamanho permitido.')

    return {
      bytes,
      githubPath: path,
      fileName: path.split('/').at(-1) as string,
      contentType: response.headers.get('content-type'),
      size: bytes.byteLength,
      sourceSha256: hashRagBytes(bytes),
    }
  } finally {
    clearTimeout(timeout)
  }
}
