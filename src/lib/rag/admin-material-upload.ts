import { z } from 'zod'
import { RagGitHubRequestError, validateGitHubMaterialPath, type GitHubMaterialWriter, type RagGitHubRequestErrorCode } from './github-loader'
import { exceedsRagUploadLimit } from './upload-limits'
import {
  ragMaterialBrowserInputSchema,
  registerRagMaterial,
  validateRagMaterialRegistration,
  type RagMaterialRegistrationRepository,
  type ValidatedRagMaterialInput,
} from './admin-material'

export { MAX_RAG_UPLOAD_BYTES } from './upload-limits'
const ALLOWED_MIME: Record<'pdf' | 'txt' | 'md', readonly string[]> = {
  pdf: ['application/pdf'],
  txt: ['text/plain', 'application/octet-stream'],
  md: ['text/markdown', 'text/plain', 'application/octet-stream'],
}
const FILE_NAME = /^[\p{L}\p{N}\p{M} ._()—+-]+$/u

export const ragMaterialUploadMetadataSchema = ragMaterialBrowserInputSchema
  .omit({ github_path: true, arquivo_origem: true, tipo_arquivo: true })
  .extend({ categoria: z.enum(['edital', 'documentos_gerais']) })

export interface RagUploadFile {
  name: string
  type: string
  size: number
  arrayBuffer(): Promise<ArrayBuffer>
}
export interface RagUploadContestContext { organization: string; year: number | null }
export interface RagMaterialUploadDependencies {
  registration: RagMaterialRegistrationRepository
  github: GitHubMaterialWriter
  loadContestContext(concursoId: number): Promise<RagUploadContestContext | null>
}
export interface RagMaterialUploadResult { materialId: number; githubPath: string }

export class RagMaterialUploadError extends Error {
  constructor(
    readonly code: 'INVALID_FILE' | 'FILE_TOO_LARGE' | 'GITHUB_CONFLICT' | 'GITHUB_FAILURE' | RagGitHubRequestErrorCode | 'FILE_UPLOADED_METADATA_FAILED',
    readonly githubPath: string | null = null,
  ) {
    super(code)
    this.name = 'RagMaterialUploadError'
  }
}

export function validateRagUploadFileName(name: string): { fileName: string; fileType: 'pdf' | 'txt' | 'md' } {
  if (!name || name !== name.trim() || name.includes('\0') || name.includes('/') || name.includes('\\') || name.includes('..') || !FILE_NAME.test(name)) {
    throw new RagMaterialUploadError('INVALID_FILE')
  }
  const extension = name.match(/\.([^.]+)$/)?.[1]?.toLowerCase()
  if (extension !== 'pdf' && extension !== 'txt' && extension !== 'md') throw new RagMaterialUploadError('INVALID_FILE')
  return { fileName: name, fileType: extension }
}

export function buildRagUploadPath(context: RagUploadContestContext, category: 'edital' | 'documentos_gerais', fileName: string) {
  const organization = context.organization.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (!organization) throw new RagMaterialUploadError('INVALID_FILE')
  const segments = ['concursos', organization, ...(context.year === null ? [] : [String(context.year)]), category, fileName]
  return validateGitHubMaterialPath(segments.join('/'))
}

async function readAndValidateFile(file: RagUploadFile) {
  const { fileName, fileType } = validateRagUploadFileName(file.name)
  if (!Number.isSafeInteger(file.size) || file.size < 1) throw new RagMaterialUploadError('INVALID_FILE')
  if (exceedsRagUploadLimit(file.size)) throw new RagMaterialUploadError('FILE_TOO_LARGE')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.byteLength < 1 || bytes.byteLength !== file.size) throw new RagMaterialUploadError('INVALID_FILE')
  if (exceedsRagUploadLimit(bytes.byteLength)) throw new RagMaterialUploadError('FILE_TOO_LARGE')
  if (file.type && !ALLOWED_MIME[fileType].includes(file.type.toLowerCase())) throw new RagMaterialUploadError('INVALID_FILE')
  if (fileType === 'pdf') {
    if (new TextDecoder('ascii').decode(bytes.slice(0, 5)) !== '%PDF-') throw new RagMaterialUploadError('INVALID_FILE')
  } else {
    const nulCount = bytes.reduce((total, byte) => total + (byte === 0 ? 1 : 0), 0)
    if (nulCount >= 8 || nulCount / bytes.byteLength > 0.01) throw new RagMaterialUploadError('INVALID_FILE')
  }
  return { bytes, fileName, fileType }
}

export async function uploadAndRegisterRagMaterial(
  dependencies: RagMaterialUploadDependencies,
  concursoId: number,
  metadata: z.output<typeof ragMaterialUploadMetadataSchema>,
  file: RagUploadFile,
): Promise<RagMaterialUploadResult> {
  const validatedFile = await readAndValidateFile(file)
  const context = await dependencies.loadContestContext(concursoId)
  if (!context) throw new RagMaterialUploadError('INVALID_FILE')
  const githubPath = buildRagUploadPath(context, metadata.categoria, validatedFile.fileName)
  const registrationInput: ValidatedRagMaterialInput = {
    titulo: metadata.titulo,
    prova_id: metadata.prova_id,
    disciplina: metadata.disciplina,
    assunto: metadata.assunto,
    subassunto: metadata.subassunto,
    arquivo_origem: validatedFile.fileName,
    github_path: githubPath,
    tipo_arquivo: validatedFile.fileType,
    categoria_documental: metadata.categoria_documental,
  }
  await validateRagMaterialRegistration(dependencies.registration, concursoId, registrationInput)

  let exists: boolean
  try { exists = await dependencies.github.fileExists(githubPath) } catch { throw new RagMaterialUploadError('GITHUB_FAILURE') }
  if (exists) throw new RagMaterialUploadError('GITHUB_CONFLICT', githubPath)
  try {
    await dependencies.github.createFile(githubPath, validatedFile.bytes, `Add RAG material: ${validatedFile.fileName}`)
  } catch (error) {
    if (error instanceof RagGitHubRequestError) throw new RagMaterialUploadError(error.code, githubPath)
    throw new RagMaterialUploadError('GITHUB_FAILURE')
  }
  try {
    const row = await registerRagMaterial(dependencies.registration, concursoId, registrationInput)
    return { materialId: row.id, githubPath }
  } catch {
    throw new RagMaterialUploadError('FILE_UPLOADED_METADATA_FAILED', githubPath)
  }
}
