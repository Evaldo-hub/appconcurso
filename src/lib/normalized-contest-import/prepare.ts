import {
  CATALOG_NORMALIZATION_VERSION,
  createCatalogCanonicalKey,
  normalizeCatalogHierarchy,
  serializeCatalogIdentity,
  type CatalogHierarchy,
} from '@/lib/contest-catalog/canonical-key'
import { parseContestManifestText } from '@/lib/contest-manifest/schema'
import type { ContestManifest, ManifestDiscipline } from '@/lib/contest-manifest/types'
import type {
  AtomicNormalizedImportExecutor,
  NormalizedBootstrapPreparation,
  NormalizedCatalogPlanRow,
  NormalizedDryRunReport,
  NormalizedImportPlan,
  NormalizedLinkPlanRow,
} from './types'

export const TRT8_2026_IMPORT_ORIGIN = 'trt8-2026-manifest-v1'

type LogicalRow = {
  hierarchy: CatalogHierarchy
  active: boolean
  disciplineOrder: number
  subjectOrder: number | null
  subsubjectOrder: number | null
  order: number
}

function flattenDiscipline(discipline: ManifestDiscipline): LogicalRow[] {
  const disciplineRow: LogicalRow = {
    hierarchy: { disciplina: discipline.disciplina, assunto: null, subassunto: null },
    active: discipline.ativo,
    disciplineOrder: discipline.ordem,
    subjectOrder: null,
    subsubjectOrder: null,
    order: discipline.ordem,
  }
  const descendants = discipline.assuntos.flatMap<LogicalRow>((subject) => [
    {
      hierarchy: { disciplina: discipline.disciplina, assunto: subject.assunto, subassunto: null },
      active: discipline.ativo && subject.ativo,
      disciplineOrder: discipline.ordem,
      subjectOrder: subject.ordem,
      subsubjectOrder: null,
      order: subject.ordem,
    },
    ...subject.subassuntos.map((subsubject) => ({
      hierarchy: { disciplina: discipline.disciplina, assunto: subject.assunto, subassunto: subsubject.subassunto },
      active: discipline.ativo && subject.ativo && subsubject.ativo,
      disciplineOrder: discipline.ordem,
      subjectOrder: subject.ordem,
      subsubjectOrder: subsubject.ordem,
      order: subsubject.ordem,
    })),
  ])
  return [disciplineRow, ...descendants]
}

export function parseNormalizedManifestText(source: string) {
  let raw: unknown
  try {
    raw = JSON.parse(source)
  } catch {
    return { success: false as const, errors: [{ path: 'manifesto', message: 'JSON sintaticamente inválido.' }] }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { success: false as const, errors: [{ path: 'manifesto', message: 'Objeto JSON esperado.' }] }
  }

  const adapted = { ...(raw as Record<string, unknown>) }
  const legacyContestIdIgnored = 'concurso_id' in adapted
  delete adapted.concurso_id
  if (adapted.schema_version === '1.0') adapted.schema_version = 1

  const parsed = parseContestManifestText(JSON.stringify(adapted))
  return parsed.success
    ? { success: true as const, data: parsed.data, legacyContestIdIgnored }
    : parsed
}

export function prepareNormalizedBootstrap(
  manifest: ContestManifest,
  options: {
    legacyContestIdIgnored?: boolean
    origin?: string
    declaredCommonBlocks?: string[]
    examSchooling?: ReadonlyMap<string, string | null>
  } = {},
): NormalizedBootstrapPreparation {
  const origin = options.origin ?? TRT8_2026_IMPORT_ORIGIN
  const commonByCode = new Map(manifest.conteudos_comuns.map((block) => [block.codigo, block]))
  const catalog = new Map<string, NormalizedCatalogPlanRow & { identity: string; exams: Set<string>; variants: Set<string> }>()
  const links = new Map<string, NormalizedLinkPlanRow>()
  const canonicalConflicts: string[] = []
  const invalidHierarchies: string[] = []
  const emptyContents: string[] = []
  const duplicateExamCodes: string[] = []
  const seenExamCodes = new Set<string>()
  let logicalAssociations = 0

  const declaredCommonBlocks = new Set(options.declaredCommonBlocks ?? [])
  const byExam = manifest.provas.map((exam) => {
    if (seenExamCodes.has(exam.codigo)) duplicateExamCodes.push(exam.codigo)
    seenExamCodes.add(exam.codigo)
    const referencedCommonRows = exam.conteudos_comuns.flatMap((code) =>
      (commonByCode.get(code)?.disciplinas ?? []).flatMap(flattenDiscipline),
    )
    const explicitlyCommonDisciplines = exam.conteudo_programatico.filter((item) => declaredCommonBlocks.has(item.disciplina))
    const explicitlySpecificDisciplines = exam.conteudo_programatico.filter((item) => !declaredCommonBlocks.has(item.disciplina))
    const commonRows = [...referencedCommonRows, ...explicitlyCommonDisciplines.flatMap(flattenDiscipline)]
    const specificRows = explicitlySpecificDisciplines.flatMap(flattenDiscipline)
    const rows = [
      ...commonRows.map((row) => ({ ...row, source: 'common' as const })),
      ...specificRows.map((row) => ({ ...row, source: 'specific' as const })),
    ]
    const examKeys = new Set<string>()

    for (const row of rows) {
      logicalAssociations += 1
      try {
        const hierarchy = normalizeCatalogHierarchy(row.hierarchy)
        const canonicalKey = createCatalogCanonicalKey(hierarchy)
        const identity = serializeCatalogIdentity(hierarchy)
        const existing = catalog.get(canonicalKey)
        if (existing && existing.identity !== identity) canonicalConflicts.push(canonicalKey)
        if (!existing) {
          catalog.set(canonicalKey, {
            ...hierarchy,
            canonicalKey,
            normalizationVersion: CATALOG_NORMALIZATION_VERSION,
            active: row.active,
            identity,
            exams: new Set([exam.codigo]),
            variants: new Set([JSON.stringify(row.hierarchy)]),
          })
        } else {
          existing.exams.add(exam.codigo)
          existing.variants.add(JSON.stringify(row.hierarchy))
          existing.active ||= row.active
        }

        const linkKey = `${exam.codigo}\u0000${canonicalKey}`
        if (links.has(linkKey)) {
          invalidHierarchies.push(`${exam.codigo}: conteúdo repetido após canonical-v1 (${canonicalKey})`)
          continue
        }
        links.set(linkKey, {
          examCode: exam.codigo,
          canonicalKey,
          active: row.active,
          disciplineOrder: row.disciplineOrder,
          subjectOrder: row.subjectOrder,
          subsubjectOrder: row.subsubjectOrder,
          order: row.order,
          origin,
        })
        examKeys.add(canonicalKey)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Conteúdo inválido.'
        if (/obrigatória/i.test(message)) emptyContents.push(`${exam.codigo}: ${message}`)
        else invalidHierarchies.push(`${exam.codigo}: ${message}`)
      }
    }

    return {
      examCode: exam.codigo,
      role: exam.cargo,
      specialty: exam.especialidade,
      schooling: options.examSchooling?.get(exam.codigo) ?? null,
      shift: exam.turno,
      associatedCommonBlocks: exam.conteudo_programatico
        .filter((item) => declaredCommonBlocks.has(item.disciplina))
        .map((item) => item.disciplina),
      commonContents: commonRows.length,
      specificContents: specificRows.length,
      totalAfterExpansion: rows.length,
      uniqueCanonicalContents: examKeys.size,
      predictedLinks: examKeys.size,
    }
  })

  const catalogRows = [...catalog.values()]
  const plan: NormalizedImportPlan = {
    contest: {
      slug: manifest.slug,
      nome: manifest.nome,
      orgao: manifest.orgao,
      banca: manifest.banca,
      ano: manifest.ano,
      edital: manifest.edital,
      data_prova: manifest.data_prova,
      descricao: manifest.descricao,
    },
    exams: manifest.provas.map((exam) => ({
      code: exam.codigo,
      name: exam.nome,
      role: exam.cargo,
      specialty: exam.especialidade,
      shift: exam.turno,
      sourceFile: exam.arquivo_origem,
      active: exam.ativo,
    })),
    catalog: catalogRows.map((row) => ({
      disciplina: row.disciplina,
      assunto: row.assunto,
      subassunto: row.subassunto,
      canonicalKey: row.canonicalKey,
      normalizationVersion: row.normalizationVersion,
      active: row.active,
    })),
    links: [...links.values()],
    origin,
  }
  const dryRun: NormalizedDryRunReport = {
    contest: { slug: manifest.slug, status: 'resolvable-by-slug', legacyContestIdIgnored: options.legacyContestIdIgnored ?? false },
    exams: manifest.provas.length,
    commonBlocks: options.declaredCommonBlocks?.length ?? manifest.conteudos_comuns.length,
    logicalAssociations,
    predictedLinks: plan.links.length,
    uniqueCanonicalContents: plan.catalog.length,
    sharedCanonicalContents: catalogRows.filter((row) => row.exams.size > 1).length,
    duplicatesEliminated: logicalAssociations - plan.catalog.length,
    canonicalConflicts: [...new Set(canonicalConflicts)],
    invalidHierarchies,
    duplicateExamCodes: [...new Set(duplicateExamCodes)],
    examsWithoutCode: manifest.provas.filter((exam) => !exam.codigo).length,
    emptyContents,
    // Rótulos superiores são documentação. Somente provas[].conteudo_programatico
    // (adaptado de provas[].disciplinas[]) produz catálogo e vínculos.
    structuralErrors: [],
    sharedExamples: catalogRows
      .filter((row) => row.exams.size > 1)
      .slice(0, 10)
      .map((row) => ({
        canonicalKey: row.canonicalKey,
        hierarchy: { disciplina: row.disciplina, assunto: row.assunto, subassunto: row.subassunto },
        examCodes: [...row.exams],
      })),
    normalizationConvergences: catalogRows
      .filter((row) => row.variants.size > 1)
      .map((row) => ({ canonicalKey: row.canonicalKey, variants: [...row.variants] })),
    byExam,
  }
  return { manifest, plan, dryRun }
}

export async function executeNormalizedBootstrap<TResult>(
  preparation: NormalizedBootstrapPreparation,
  executor: AtomicNormalizedImportExecutor<TResult>,
): Promise<TResult> {
  const report = preparation.dryRun
  const blockers = report.canonicalConflicts.length + report.invalidHierarchies.length
    + report.duplicateExamCodes.length + report.examsWithoutCode + report.emptyContents.length
    + report.structuralErrors.length
  if (blockers > 0) throw new Error('O plano contém erros e não pode ser persistido.')
  return executor.executeAtomically(preparation.plan)
}
