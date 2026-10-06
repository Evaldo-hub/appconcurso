import {
  listarDisciplinasDaProva,
  listarDisciplinasDoConcurso,
  type NormalizedSelectionCatalog,
} from '@/lib/contest-catalog/selection'

export function listRagMaterialDisciplines(
  catalog: NormalizedSelectionCatalog,
  contestId: number,
  proofId: number | null,
) {
  return proofId === null
    ? listarDisciplinasDoConcurso(catalog, contestId)
    : listarDisciplinasDaProva(catalog, proofId)
}

export function disciplineAfterProofChange(currentDiscipline: string, availableDisciplines: readonly string[]) {
  return availableDisciplines.includes(currentDiscipline) ? currentDiscipline : ''
}
