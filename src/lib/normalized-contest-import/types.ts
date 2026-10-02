import type { CatalogHierarchy } from '@/lib/contest-catalog/canonical-key'
import type { ContestManifest } from '@/lib/contest-manifest/types'

export type NormalizedContentOrigin = 'common' | 'specific'

export interface NormalizedCatalogPlanRow extends CatalogHierarchy {
  canonicalKey: string
  normalizationVersion: 'canonical-v1'
  active: boolean
}

export interface NormalizedLinkPlanRow {
  examCode: string
  canonicalKey: string
  active: boolean
  disciplineOrder: number | null
  subjectOrder: number | null
  subsubjectOrder: number | null
  order: number | null
  origin: string
}

export interface NormalizedExamPlanRow {
  code: string
  name: string
  role: string
  specialty: string | null
  shift: string | null
  sourceFile: string | null
  active: boolean
}

export interface NormalizedImportPlan {
  contest: Pick<ContestManifest, 'slug' | 'nome' | 'orgao' | 'banca' | 'ano' | 'edital' | 'data_prova' | 'descricao'>
  exams: NormalizedExamPlanRow[]
  catalog: NormalizedCatalogPlanRow[]
  links: NormalizedLinkPlanRow[]
  origin: string
}

export interface ExamDryRunReport {
  examCode: string
  role: string
  specialty: string | null
  schooling: string | null
  shift: string | null
  associatedCommonBlocks: string[]
  commonContents: number
  specificContents: number
  totalAfterExpansion: number
  uniqueCanonicalContents: number
  predictedLinks: number
}

export interface NormalizedDryRunReport {
  contest: { slug: string; status: 'resolvable-by-slug'; legacyContestIdIgnored: boolean }
  exams: number
  commonBlocks: number
  logicalAssociations: number
  predictedLinks: number
  uniqueCanonicalContents: number
  sharedCanonicalContents: number
  duplicatesEliminated: number
  canonicalConflicts: string[]
  invalidHierarchies: string[]
  duplicateExamCodes: string[]
  examsWithoutCode: number
  emptyContents: string[]
  structuralErrors: string[]
  sharedExamples: Array<{ canonicalKey: string; hierarchy: CatalogHierarchy; examCodes: string[] }>
  normalizationConvergences: Array<{ canonicalKey: string; variants: string[] }>
  byExam: ExamDryRunReport[]
}

export interface NormalizedBootstrapPreparation {
  manifest: ContestManifest
  plan: NormalizedImportPlan
  dryRun: NormalizedDryRunReport
}

export interface AtomicNormalizedImportExecutor<TResult> {
  executeAtomically(plan: NormalizedImportPlan): Promise<TResult>
}

export interface NormalizedImportRpcPayload {
  concurso: {
    slug: string
    nome: string
    orgao: string
    banca: string
    ano: number
    edital: string | null
    data_prova: string | null
    descricao: string | null
  }
  provas: Array<{
    codigo_prova: string
    nome: string
    cargo: string | null
    especialidade: string | null
    turno: string | null
    arquivo_origem: string | null
    ativo: boolean
  }>
  conteudos: Array<{
    disciplina: string
    assunto: string | null
    subassunto: string | null
    chave_canonica: string
    versao_normalizacao: 'canonical-v1'
    ativo: boolean
  }>
  vinculos: Array<{
    codigo_prova: string
    chave_canonica: string
    ativo: boolean
    disciplina_ordem: number | null
    assunto_ordem: number | null
    subassunto_ordem: number | null
    ordem: number | null
    origem: string
  }>
  contagens_esperadas: { provas: number; conteudos: number; vinculos: number }
}

export interface NormalizedImportRpcResult {
  concurso_id: number
  provas_total: number
  provas_inseridas: number
  provas_reutilizadas: number
  conteudos_total: number
  conteudos_inseridos: number
  conteudos_reutilizados: number
  vinculos_total: number
  vinculos_inseridos: number
  vinculos_reutilizados: number
}
