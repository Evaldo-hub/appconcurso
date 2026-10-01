export type PublicAnswerLetter = 'A' | 'B' | 'C' | 'D' | 'E'

export interface PublicStudyQuestion {
  id: number
  disciplina: string
  assunto: string
  subassunto: string | null
  banca: string
  dificuldade: string
  enunciado: string
  alternativas: Record<PublicAnswerLetter, string>
}

export interface PublicStudyQuestionRow {
  id: unknown; disciplina: unknown; assunto: unknown; subassunto: unknown; banca: unknown; dificuldade: unknown
  enunciado: unknown; alternativa_a: unknown; alternativa_b: unknown; alternativa_c: unknown; alternativa_d: unknown; alternativa_e: unknown
}

export function parseStudyQuestionId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function toPublicStudyQuestion(row: PublicStudyQuestionRow): PublicStudyQuestion {
  return {
    id: Number(row.id),
    disciplina: String(row.disciplina ?? ''),
    assunto: String(row.assunto ?? ''),
    subassunto: typeof row.subassunto === 'string' && row.subassunto.trim() ? row.subassunto : null,
    banca: String(row.banca ?? ''),
    dificuldade: String(row.dificuldade ?? ''),
    enunciado: String(row.enunciado ?? ''),
    alternativas: { A: String(row.alternativa_a ?? ''), B: String(row.alternativa_b ?? ''), C: String(row.alternativa_c ?? ''), D: String(row.alternativa_d ?? ''), E: String(row.alternativa_e ?? '') },
  }
}

export function createStudyQuestionLoader(findRow: (id: number) => Promise<PublicStudyQuestionRow | null>) {
  return async (id: number) => {
    if (!Number.isSafeInteger(id) || id <= 0) return null
    const row = await findRow(id)
    return row ? toPublicStudyQuestion(row) : null
  }
}
