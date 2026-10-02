import { createHash } from 'node:crypto'

export const CATALOG_NORMALIZATION_VERSION = 'canonical-v1' as const

export interface CatalogHierarchy {
  disciplina: string
  assunto: string | null
  subassunto: string | null
}

// Texto persistido: preserva capitalização, mas uniformiza Unicode e espaços.
function normalizeDisplayLevel(value: string): string {
  return value
    .normalize('NFC')
    .trim()
    .replace(/\s+/gu, ' ')
    .normalize('NFC')
}

function normalizeOptionalDisplayLevel(value: string | null): string | null {
  if (value === null) return null
  return normalizeDisplayLevel(value) || null
}

export function normalizeCatalogHierarchy(input: CatalogHierarchy): CatalogHierarchy {
  const disciplina = normalizeDisplayLevel(input.disciplina)
  if (!disciplina) throw new Error('Disciplina é obrigatória.')

  const normalized = {
    disciplina,
    assunto: normalizeOptionalDisplayLevel(input.assunto),
    subassunto: normalizeOptionalDisplayLevel(input.subassunto),
  }

  if (normalized.subassunto !== null && normalized.assunto === null) {
    throw new Error('Subassunto exige assunto.')
  }

  return normalized
}

// Identidade: lowercase determinístico, sem locale. Esta camada mantém null e
// string vazia distintos; o domínio persistido, porém, converte vazio em null.
export function serializeCatalogIdentity(input: CatalogHierarchy): string {
  const identityLevel = (value: string) => normalizeDisplayLevel(value).toLowerCase().normalize('NFC')

  return JSON.stringify([
    identityLevel(input.disciplina),
    input.assunto === null ? null : identityLevel(input.assunto),
    input.subassunto === null ? null : identityLevel(input.subassunto),
  ])
}

export function createCatalogCanonicalKey(input: CatalogHierarchy): string {
  const persisted = normalizeCatalogHierarchy(input)
  const serialized = serializeCatalogIdentity(persisted)

  return createHash('sha256').update(serialized, 'utf8').digest('hex')
}
