import 'server-only'

import { loadAuthorizedNormalizedCatalogBySlug } from '@/lib/contest-catalog/queries'

export type {
  NormalizedSelectionCatalog as RagSelectionCatalog,
  NormalizedSelectionContest as RagSelectionContest,
  NormalizedSelectionExam as RagSelectionExam,
  NormalizedSelectionTaxonomy as RagSelectionTaxonomy,
} from '@/lib/contest-catalog/selection'
export type { NormalizedSelectionCatalogResult as RagSelectionCatalogResult } from '@/lib/contest-catalog/queries'

export function loadRagSelectionCatalog() {
  return loadAuthorizedNormalizedCatalogBySlug('trt8-2026')
}
