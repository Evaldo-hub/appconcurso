import type { ContestManifestPreview, DiffStatus } from '@/lib/contest-manifest/types'

export type DifferenceCounts = Record<DiffStatus, number>

export interface PreviewDifferenceSummary {
  concurso: DifferenceCounts
  provas: DifferenceCounts
  conteudos: DifferenceCounts
  materiais: DifferenceCounts
  total: DifferenceCounts
}

const emptyCounts = (): DifferenceCounts => ({
  inserir: 0,
  atualizar: 0,
  sem_alteracao: 0,
  somente_supabase: 0,
})

const countStatuses = (statuses: DiffStatus[]) =>
  statuses.reduce((counts, status) => {
    counts[status] += 1
    return counts
  }, emptyCounts())

export function summarizePreviewDifferences(preview: ContestManifestPreview): PreviewDifferenceSummary {
  const contestStatus: DiffStatus = preview.concurso.status === 'novo'
    ? 'inserir'
    : preview.concurso.status === 'alterado'
      ? 'atualizar'
      : 'sem_alteracao'

  const summary = {
    concurso: countStatuses([contestStatus]),
    provas: countStatuses(preview.provas.map((item) => item.status)),
    conteudos: countStatuses(preview.conteudos.map((item) => item.status)),
    materiais: countStatuses(preview.materiais.map((item) => item.status)),
  }

  return {
    ...summary,
    total: (Object.keys(emptyCounts()) as DiffStatus[]).reduce((total, status) => {
      total[status] = summary.concurso[status] + summary.provas[status] + summary.conteudos[status] + summary.materiais[status]
      return total
    }, emptyCounts()),
  }
}
