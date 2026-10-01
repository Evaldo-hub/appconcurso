export function assertInitialConcursoId(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('Selecione um concurso válido para continuar.')
  }
  return value
}
