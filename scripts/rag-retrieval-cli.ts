import type { RagRetrievalInput, RagRetrievalResult } from '../src/lib/rag/types'

export interface RagRetrievalCliOptions extends RagRetrievalInput {
  provaId: number
  disciplina: string
  assunto: string
}

function argument(argv: readonly string[], name: string) {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

function positiveInteger(value: string | undefined, name: string) {
  const parsed = Number(value)
  if (!value || !Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} deve ser um inteiro positivo.`)
  return parsed
}

function requiredText(value: string | undefined, name: string) {
  const parsed = value?.trim()
  if (!parsed) throw new Error(`${name} deve ser uma string não vazia.`)
  return parsed
}

export function parseRagRetrievalCliArguments(argv: readonly string[]): RagRetrievalCliOptions {
  const limitValue = argument(argv, '--limit')
  const subassunto = argument(argv, '--subassunto')?.trim() || null
  return {
    concursoId: positiveInteger(argument(argv, '--concurso-id'), '--concurso-id'),
    provaId: positiveInteger(argument(argv, '--prova-id'), '--prova-id'),
    disciplina: requiredText(argument(argv, '--disciplina'), '--disciplina'),
    assunto: requiredText(argument(argv, '--assunto'), '--assunto'),
    subassunto,
    query: requiredText(argument(argv, '--query'), '--query'),
    ...(limitValue === undefined ? {} : { limit: positiveInteger(limitValue, '--limit') }),
  }
}

export function formatRagRetrievalCliResult(result: RagRetrievalResult) {
  return {
    provider: result.provider,
    model: result.model,
    dimensions: result.dimensions,
    match_count: result.matches.length,
    matches: result.matches.map((match, index) => ({
      rank: index + 1,
      document_id: match.documentId,
      material_id: match.materialId,
      ingestion_id: match.ingestionId,
      pagina: match.pagina,
      arquivo_origem: match.arquivoOrigem,
      github_path: match.githubPath,
      disciplina: match.disciplina,
      assunto: match.assunto,
      subassunto: match.subassunto,
      similarity: match.similarity,
    })),
  }
}
