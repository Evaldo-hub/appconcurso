import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { RAG_CONFIG } from '@/lib/rag/config'
import { retrieveRagContext } from '@/lib/rag/retrieval'
import type { RagRetrievalInput, RagRetrievalMatch } from '@/lib/rag/types'
import type { StudyAction } from '@/lib/ai/study-question'

const MAX_CONTEXT_CHARACTERS = 24_000
const DIRECT_CONTEXT_TARGET = 6_000
const SEMANTIC_LIMIT = 6

export interface StudyRagQuestion {
  id: number
  concurso_id: number
  prova_id: number | null
  disciplina: string | null
  assunto: string | null
  subassunto: string | null
  enunciado: string
}

export interface StudyRagSource {
  documentId: number
  materialId: number
  titulo: string
  pagina: number | null
  chunkIndex: number
}

export interface StudyRagContext {
  contextText: string
  sources: StudyRagSource[]
  directSourceCount: number
  supplementalSourceCount: number
}

interface DirectDocumentRow {
  id: number
  material_id: number
  ingestion_id: number
  concurso_id: number
  content: string
  pagina: number | null
  chunk_index: number
  embedding_provider: string | null
  embedding_model: string | null
  embedding_dimensions: number | null
  ingestion_version: string | null
}

interface MaterialRow {
  id: number
  concurso_id: number
  prova_id: number | null
  titulo: string
  arquivo_origem: string | null
  ativo: boolean
}

interface IngestionRow {
  id: number
  material_id: number
  status: string
  ativa: boolean
  embedding_provider: string
  embedding_model: string
  embedding_dimensions: number
  ingestion_version: string
}

export interface StudyRagContextDependencies {
  loadDirect: (questionId: number) => Promise<{
    documentIds: number[]
    documents: DirectDocumentRow[]
    materials: MaterialRow[]
    ingestions: IngestionRow[]
  }>
  retrieve: (input: RagRetrievalInput) => Promise<{ matches: RagRetrievalMatch[] }>
}

function validProofScope(question: StudyRagQuestion, material: MaterialRow) {
  return question.prova_id === null
    ? material.prova_id === null
    : material.prova_id === null || material.prova_id === question.prova_id
}

export function selectEligibleDirectSources(
  question: StudyRagQuestion,
  input: Awaited<ReturnType<StudyRagContextDependencies['loadDirect']>>,
) {
  const materials = new Map(input.materials.map((item) => [item.id, item]))
  const ingestions = new Map(input.ingestions.map((item) => [item.id, item]))
  const requested = new Set(input.documentIds)

  return input.documents.filter((document) => {
    const material = materials.get(document.material_id)
    const ingestion = ingestions.get(document.ingestion_id)
    return requested.has(document.id)
      && document.concurso_id === question.concurso_id
      && material?.concurso_id === question.concurso_id
      && material.ativo
      && validProofScope(question, material)
      && ingestion?.material_id === material.id
      && ingestion.status === 'concluida'
      && ingestion.ativa
      && ingestion.ingestion_version === RAG_CONFIG.ingestionVersion
      && ingestion.embedding_provider === RAG_CONFIG.embedding.provider
      && ingestion.embedding_model === RAG_CONFIG.embedding.model
      && ingestion.embedding_dimensions === RAG_CONFIG.embedding.dimensions
      && document.ingestion_version === RAG_CONFIG.ingestionVersion
      && document.embedding_provider === ingestion.embedding_provider
      && document.embedding_model === ingestion.embedding_model
      && document.embedding_dimensions === ingestion.embedding_dimensions
  }).map((document) => ({
    document,
    material: materials.get(document.material_id)!,
  }))
}

function appendChunk(parts: string[], currentLength: number, title: string, page: number | null, content: string) {
  const header = `Fonte: ${title}${page ? ` (página ${page})` : ''}\n`
  const available = MAX_CONTEXT_CHARACTERS - currentLength - header.length - 2
  if (available <= 0) return currentLength
  const chunk = `${header}${content.slice(0, available).trim()}`
  if (!chunk.trim()) return currentLength
  parts.push(chunk)
  return currentLength + chunk.length + 2
}

function shouldSupplement(action: StudyAction, directLength: number) {
  return action !== 'explicacao' && directLength < DIRECT_CONTEXT_TARGET
}

export function createStudyRagContextBuilder(dependencies: StudyRagContextDependencies) {
  return async function buildStudyRagContext(input: {
    question: StudyRagQuestion
    action: StudyAction
    studentQuestion?: string
  }): Promise<StudyRagContext> {
    const directData = await dependencies.loadDirect(input.question.id)
    const direct = selectEligibleDirectSources(input.question, directData)
    const parts: string[] = []
    const sources: StudyRagSource[] = []
    const usedDocuments = new Set<number>()
    let contextLength = 0

    for (const { document, material } of direct) {
      if (usedDocuments.has(document.id)) continue
      const before = contextLength
      contextLength = appendChunk(parts, contextLength, material.titulo || material.arquivo_origem || 'Material', document.pagina, document.content)
      if (contextLength === before) break
      usedDocuments.add(document.id)
      sources.push({ documentId: document.id, materialId: material.id, titulo: material.titulo || material.arquivo_origem || 'Material', pagina: document.pagina, chunkIndex: document.chunk_index })
    }

    const directSourceCount = sources.length
    if (shouldSupplement(input.action, contextLength) && contextLength < MAX_CONTEXT_CHARACTERS) {
      const query = [input.question.enunciado, input.studentQuestion].filter(Boolean).join('\n')
      try {
        const supplemental = await dependencies.retrieve({
          concursoId: input.question.concurso_id,
          provaId: input.question.prova_id,
          query,
          disciplina: input.question.disciplina,
          assunto: input.question.assunto,
          subassunto: input.question.subassunto,
          limit: SEMANTIC_LIMIT,
        })
        for (const match of supplemental.matches) {
          if (usedDocuments.has(match.documentId)) continue
          const title = match.arquivoOrigem || match.githubPath || 'Material'
          const before = contextLength
          contextLength = appendChunk(parts, contextLength, title, match.pagina, match.content)
          if (contextLength === before) break
          usedDocuments.add(match.documentId)
          sources.push({ documentId: match.documentId, materialId: match.materialId, titulo: title, pagina: match.pagina, chunkIndex: match.chunkIndex })
        }
      } catch (error) {
        console.warn('study_ai', {
          event: 'semantic_supplement_unavailable',
          error_name: error instanceof Error ? error.name : 'UnknownError',
        })
      }
    }

    return {
      contextText: parts.join('\n\n'),
      sources,
      directSourceCount,
      supplementalSourceCount: sources.length - directSourceCount,
    }
  }
}

async function loadDirect(admin: SupabaseClient, questionId: number) {
  const { data: links, error: linksError } = await admin
    .from('questao_fontes')
    .select('document_id')
    .eq('questao_id', questionId)
  if (linksError) throw new Error('Não foi possível carregar as fontes da questão.')

  const documentIds = [...new Set((links ?? [])
    .map((link) => Number(link.document_id))
    .filter((id) => Number.isSafeInteger(id) && id > 0))]
  if (documentIds.length === 0) return { documentIds, documents: [], materials: [], ingestions: [] }

  const { data: documents, error: documentsError } = await admin
    .from('documents')
    .select('id, material_id, ingestion_id, concurso_id, content, pagina, chunk_index, embedding_provider, embedding_model, embedding_dimensions, ingestion_version')
    .in('id', documentIds)
    .not('embedding', 'is', null)
  if (documentsError) throw new Error('Não foi possível carregar os documentos RAG.')

  const materialIds = [...new Set((documents ?? []).map((item) => Number(item.material_id)).filter((id) => id > 0))]
  const ingestionIds = [...new Set((documents ?? []).map((item) => Number(item.ingestion_id)).filter((id) => id > 0))]
  const [{ data: materials, error: materialsError }, { data: ingestions, error: ingestionsError }] = await Promise.all([
    admin.from('materiais_concurso').select('id, concurso_id, prova_id, titulo, arquivo_origem, ativo').in('id', materialIds),
    admin.from('rag_ingestoes').select('id, material_id, status, ativa, embedding_provider, embedding_model, embedding_dimensions, ingestion_version').in('id', ingestionIds),
  ])
  if (materialsError || ingestionsError) throw new Error('Não foi possível validar as fontes RAG.')

  return {
    documentIds,
    documents: (documents ?? []) as DirectDocumentRow[],
    materials: (materials ?? []) as MaterialRow[],
    ingestions: (ingestions ?? []) as IngestionRow[],
  }
}

export async function buildStudyRagContext(admin: SupabaseClient, input: {
  question: StudyRagQuestion
  action: StudyAction
  studentQuestion?: string
}) {
  return createStudyRagContextBuilder({
    loadDirect: (questionId) => loadDirect(admin, questionId),
    retrieve: retrieveRagContext,
  })(input)
}
