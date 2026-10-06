import { z } from 'zod'
import { RAG_DOCUMENT_CATEGORIES } from './types'

const optionalText = (maximum: number) => z.string().trim().max(maximum).transform((value) => value || null)
const githubPathSchema = z.string().trim().min(1).max(2000).refine((value) => {
  if (value.includes('\0') || value.includes('\\') || value.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(value)) return false
  const segments = value.split('/')
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}, 'Caminho de origem inválido.')

export const ragMaterialBrowserInputSchema = z.object({
  titulo: z.string().trim().min(1).max(300),
  prova_id: z.string().trim().default('').transform((value, context) => {
    if (!value) return null
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      context.addIssue({ code: 'custom', message: 'Prova inválida.' })
      return z.NEVER
    }
    return parsed
  }),
  disciplina: z.string().trim().min(1).max(300),
  assunto: optionalText(300),
  subassunto: optionalText(300),
  arquivo_origem: optionalText(500),
  github_path: githubPathSchema,
  tipo_arquivo: z.enum(['pdf', 'txt', 'md']),
  categoria_documental: z.enum(RAG_DOCUMENT_CATEGORIES),
})

export type RagMaterialBrowserInput = z.input<typeof ragMaterialBrowserInputSchema>
export type ValidatedRagMaterialInput = z.output<typeof ragMaterialBrowserInputSchema>
export type RagMaterialInsert = ValidatedRagMaterialInput & {
  concurso_id: number
  tipo_fonte: 'arquivo'
  ativo: true
}
export type RagMaterialInsertRow = { id: number }

export interface RagMaterialRegistrationRepository {
  contestExists(concursoId: number): Promise<boolean>
  examBelongsToContest(provaId: number, concursoId: number): Promise<boolean>
  disciplineBelongsToSelection(discipline: string, concursoId: number, provaId: number | null): Promise<boolean>
  duplicateExists(concursoId: number, provaId: number | null, githubPath: string): Promise<boolean>
  insertMaterial(material: RagMaterialInsert): Promise<RagMaterialInsertRow>
}

export interface ExistingGitHubFileChecker {
  checkFile(githubPath: string): Promise<{ exists: boolean; type: string | null }>
}

export class RagMaterialRegistrationError extends Error {
  readonly code: 'INVALID_CONTEST' | 'INVALID_EXAM' | 'INVALID_DISCIPLINE' | 'DUPLICATE' | 'GITHUB_FILE_NOT_FOUND' | 'GITHUB_FILE_CHECK_FAILED' | 'INSERT_FAILED'

  constructor(code: 'INVALID_CONTEST' | 'INVALID_EXAM' | 'INVALID_DISCIPLINE' | 'DUPLICATE' | 'GITHUB_FILE_NOT_FOUND' | 'GITHUB_FILE_CHECK_FAILED' | 'INSERT_FAILED') {
    super(code)
    this.code = code
    this.name = 'RagMaterialRegistrationError'
  }
}

export async function registerExistingRagMaterial(
  repository: RagMaterialRegistrationRepository,
  github: ExistingGitHubFileChecker,
  concursoId: number,
  input: ValidatedRagMaterialInput,
): Promise<RagMaterialInsertRow> {
  await validateRagMaterialRegistration(repository, concursoId, input)
  let file: { exists: boolean; type: string | null }
  try {
    file = await github.checkFile(input.github_path)
  } catch {
    throw new RagMaterialRegistrationError('GITHUB_FILE_CHECK_FAILED')
  }
  if (!file.exists || file.type !== 'file') throw new RagMaterialRegistrationError('GITHUB_FILE_NOT_FOUND')
  return insertRagMaterial(repository, concursoId, input)
}

export async function registerRagMaterial(
  repository: RagMaterialRegistrationRepository,
  concursoId: number,
  input: ValidatedRagMaterialInput,
): Promise<RagMaterialInsertRow> {
  await validateRagMaterialRegistration(repository, concursoId, input)
  return insertRagMaterial(repository, concursoId, input)
}

async function insertRagMaterial(
  repository: RagMaterialRegistrationRepository,
  concursoId: number,
  input: ValidatedRagMaterialInput,
): Promise<RagMaterialInsertRow> {
  try {
    return await repository.insertMaterial({
      ...input,
      concurso_id: concursoId,
      tipo_fonte: 'arquivo',
      ativo: true,
    })
  } catch {
    throw new RagMaterialRegistrationError('INSERT_FAILED')
  }
}

export async function validateRagMaterialRegistration(
  repository: RagMaterialRegistrationRepository,
  concursoId: number,
  input: ValidatedRagMaterialInput,
): Promise<void> {
  if (!Number.isSafeInteger(concursoId) || concursoId < 1 || !(await repository.contestExists(concursoId))) {
    throw new RagMaterialRegistrationError('INVALID_CONTEST')
  }
  if (input.prova_id !== null && !(await repository.examBelongsToContest(input.prova_id, concursoId))) {
    throw new RagMaterialRegistrationError('INVALID_EXAM')
  }
  if (!(await repository.disciplineBelongsToSelection(input.disciplina, concursoId, input.prova_id))) {
    throw new RagMaterialRegistrationError('INVALID_DISCIPLINE')
  }
  if (await repository.duplicateExists(concursoId, input.prova_id, input.github_path)) {
    throw new RagMaterialRegistrationError('DUPLICATE')
  }
}
