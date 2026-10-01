import { RagStudySelection } from '@/components/estudar/rag-study-selection'
import { loadRagSelectionCatalog } from '@/lib/study/rag-selection-catalog'

export const dynamic = 'force-dynamic'

export default async function GenerateQuestionsPage() {
  const result = await loadRagSelectionCatalog()
  return <RagStudySelection catalog={result.catalog} error={result.error} />
}
