export interface ContestFile {
  concurso_id?: number | null
  nome: string
  orgao: string
  banca: string
  ano: number
  edital: string | null
  escopo?: string | null
  observacao?: string | null
}

export interface ProgramSubtopic { nome: string; ordem: number }
export interface ProgramSubject { nome: string; ordem: number; subassuntos: ProgramSubtopic[] }
export interface ProgramDiscipline { nome: string; ordem: number; assuntos: ProgramSubject[] }
export interface ProgramExam {
  codigo_prova: string
  cargo: string
  especialidade: string | null
  escolaridade?: string | null
  turno?: string | null
  disciplinas: ProgramDiscipline[]
}
export interface ProgramFile { schema_version: '1.0'; concurso_id?: number | null; provas: ProgramExam[] }

export interface UniversalContentRow {
  prova_codigo: string
  disciplina: string
  assunto: string | null
  subassunto: string | null
  disciplina_ordem: number
  assunto_ordem: number | null
  subassunto_ordem: number | null
}

export type ImportStatus = 'novo' | 'existente' | 'atualizavel' | 'conflito'
export interface ImportPreviewItem { chave: string; titulo: string; status: ImportStatus; detalhe?: string }
export interface UniversalImportPreview {
  concurso: ContestFile & { id: number }
  resumo: { provas: number; disciplinas: number; assuntos: number; subassuntos: number }
  contagens: Record<ImportStatus, number>
  provas: ImportPreviewItem[]
  conteudos: ImportPreviewItem[]
  detalhes_provas: Array<{ codigo: string; cargo: string; especialidade: string | null; escolaridade?: string | null; disciplinas: number; assuntos: number }>
  erros: string[]
  bloqueado: boolean
}

export interface UniversalImportResult {
  concurso_id: number
  executado_em: string
  provas: { inseridos: number; atualizados: number; existentes: number }
  conteudos: { inseridos: number; atualizados: number; existentes: number }
}

export interface UniversalImportState {
  ok: boolean
  message: string | null
  errors: Array<{ path: string; message: string }>
  preview: UniversalImportPreview | null
  sourcesBase64?: string | null
  sourceHash?: string | null
  previewToken?: string | null
  result?: UniversalImportResult | null
}
