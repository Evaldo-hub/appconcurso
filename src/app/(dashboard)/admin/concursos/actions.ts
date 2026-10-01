'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdmin } from '@/lib/supabase/require-admin'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRagMaterialRegistrationRepository } from '@/lib/rag/admin-material-persistence'
import { ragMaterialBrowserInputSchema, RagMaterialRegistrationError, registerExistingRagMaterial } from '@/lib/rag/admin-material'
import { createGitHubMaterialFileChecker, createGitHubMaterialWriter } from '@/lib/rag/github-loader'
import { getRagGitHubConfig } from '@/lib/rag/config'
import { ragMaterialUploadMetadataSchema, RagMaterialUploadError, uploadAndRegisterRagMaterial } from '@/lib/rag/admin-material-upload'
import { executeStartRagIngestion, failedStartRagIngestion, successfulStartRagIngestion, type StartRagIngestionResult } from '@/lib/rag/admin-start-ingestion'
import { RAG_CONFIG, RagGitHubConfigError, getRagServerConfig } from '@/lib/rag/config'
import { createGoogleEmbeddingClient } from '@/lib/rag/embeddings'
import { ingestMaterial } from '@/lib/rag/ingest-material'
import { createPdfJsTextExtractor } from '@/lib/rag/pdf-extractor'
import { createSupabaseRagPersistence } from '@/lib/rag/persistence'
import { executeReprocessRag, failedReprocessRag, successfulReprocessRag, type ReprocessRagResult } from '@/lib/rag/admin-reprocess-ingestion'
import { reprocessMaterial } from '@/lib/rag/ingest-material'
import { executeRetryRag, failedRetryRag, successfulRetryRag, type RetryRagResult } from '@/lib/rag/admin-retry-ingestion'
import { retryFailedMaterialIngestion } from '@/lib/rag/ingest-material'

const text = z.string().trim().max(500).default('')
const concursoSchema = z.object({
  id: z.string().default(''), nome: z.string().trim().min(1).max(300), orgao: z.string().trim().min(1).max(300),
  banca: text, ano: z.string().default(''), edital: text, cargo: text, especialidade: text,
  data_prova: z.string().default(''), descricao: z.string().trim().max(10000).default(''),
})
const provaSchema = z.object({
  id: z.string().default(''), concurso_id: z.coerce.number().int().positive(), nome: z.string().trim().min(1).max(300),
  cargo: text, especialidade: text, codigo_prova: text, turno: text,
})

export async function saveConcursoAction(formData: FormData) {
  await requireAdmin()
  const parsed = concursoSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) redirect('/admin/concursos/novo?erro=campos')
  const value = parsed.data
  const id = value.id ? Number(value.id) : null
  const year = value.ano ? Number(value.ano) : null
  if ((id !== null && (!Number.isSafeInteger(id) || id < 1)) || (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2200))) redirect('/admin/concursos/novo?erro=campos')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_salvar_concurso', {
    p_id: id, p_nome: value.nome, p_orgao: value.orgao, p_banca: value.banca, p_ano: year,
    p_edital: value.edital, p_cargo: value.cargo, p_especialidade: value.especialidade,
    p_data_prova: value.data_prova || null, p_descricao: value.descricao,
  })
  if (error) redirect(`/admin/concursos/${id ?? 'novo'}?erro=migration`)
  revalidatePath('/admin/concursos')
  redirect(`/admin/concursos/${data}?salvo=1`)
}

export async function saveProvaAction(formData: FormData) {
  await requireAdmin()
  const parsed = provaSchema.safeParse(Object.fromEntries(formData.entries()))
  const fallback = String(formData.get('concurso_id') ?? '')
  if (!parsed.success) redirect(`/admin/concursos/${fallback}?erro=prova`)
  const value = parsed.data
  const id = value.id ? Number(value.id) : null
  if (id !== null && (!Number.isSafeInteger(id) || id < 1)) redirect(`/admin/concursos/${value.concurso_id}?erro=prova`)
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_salvar_prova', {
    p_id: id, p_concurso_id: value.concurso_id, p_nome: value.nome, p_cargo: value.cargo,
    p_especialidade: value.especialidade, p_codigo_prova: value.codigo_prova, p_turno: value.turno,
  })
  if (error) redirect(`/admin/concursos/${value.concurso_id}?erro=migration`)
  revalidatePath(`/admin/concursos/${value.concurso_id}`)
  redirect(`/admin/concursos/${value.concurso_id}?salvo=1`)
}

export async function saveRagMaterialAction(routeConcursoId: number, formData: FormData) {
  await requireAdmin()
  const parsed = ragMaterialBrowserInputSchema.safeParse({
    titulo: formData.get('titulo'),
    prova_id: formData.get('prova_id'),
    disciplina: formData.get('disciplina'),
    assunto: formData.get('assunto'),
    subassunto: formData.get('subassunto'),
    arquivo_origem: formData.get('arquivo_origem'),
    github_path: formData.get('github_path'),
    tipo_arquivo: formData.get('tipo_arquivo'),
  })
  if (!parsed.success || !Number.isSafeInteger(routeConcursoId) || routeConcursoId < 1) {
    redirect(`/admin/concursos/${routeConcursoId}?material_status=invalid`)
  }

  let materialId: number
  try {
    const repository = createRagMaterialRegistrationRepository(createAdminClient())
    const github = createGitHubMaterialFileChecker(getRagGitHubConfig())
    materialId = (await registerExistingRagMaterial(repository, github, routeConcursoId, parsed.data)).id
  } catch (error) {
    const status = error instanceof RagMaterialRegistrationError
      ? ({ INVALID_EXAM: 'exam', DUPLICATE: 'duplicate', INVALID_CONTEST: 'contest', GITHUB_FILE_NOT_FOUND: 'github_file_not_found', GITHUB_FILE_CHECK_FAILED: 'github_file_check_failed', INSERT_FAILED: 'error' } as const)[error.code]
      : 'error'
    redirect(`/admin/concursos/${routeConcursoId}?material_status=${status}`)
  }
  revalidatePath(`/admin/concursos/${routeConcursoId}`)
  redirect(`/admin/concursos/${routeConcursoId}?material_status=created&material_id=${materialId}`)
}

export async function uploadRagMaterialAction(routeConcursoId: number, formData: FormData) {
  await requireAdmin()
  const metadata = ragMaterialUploadMetadataSchema.safeParse({
    titulo: formData.get('titulo'), prova_id: formData.get('prova_id'), disciplina: formData.get('disciplina'),
    assunto: formData.get('assunto'), subassunto: formData.get('subassunto'), categoria: formData.get('categoria'),
  })
  const file = formData.get('arquivo')
  if (!metadata.success || !(file instanceof File) || !Number.isSafeInteger(routeConcursoId) || routeConcursoId < 1) {
    redirect(`/admin/concursos/${routeConcursoId}?material_status=upload_invalid`)
  }

  const admin = createAdminClient()
  let materialId: number
  try {
    const result = await uploadAndRegisterRagMaterial({
      registration: createRagMaterialRegistrationRepository(admin),
      github: createGitHubMaterialWriter(getRagGitHubConfig()),
      async loadContestContext(concursoId) {
        const { data, error } = await admin.from('concursos').select('orgao,ano').eq('id', concursoId)
          .maybeSingle<{ orgao: string; ano: number | null }>()
        if (error) throw error
        return data ? { organization: data.orgao, year: data.ano } : null
      },
    }, routeConcursoId, metadata.data, file)
    materialId = result.materialId
  } catch (error) {
    if (error instanceof RagMaterialRegistrationError) {
      const status = error.code === 'INVALID_EXAM' ? 'exam' : error.code === 'DUPLICATE' ? 'duplicate' : 'upload_error'
      redirect(`/admin/concursos/${routeConcursoId}?material_status=${status}`)
    }
    if (error instanceof RagMaterialUploadError) {
      const status = ({ INVALID_FILE: 'upload_invalid', FILE_TOO_LARGE: 'upload_large', GITHUB_CONFLICT: 'github_conflict', GITHUB_FAILURE: 'github_error', RAG_GITHUB_AUTH_FAILED: 'github_auth_failed', RAG_GITHUB_PERMISSION_DENIED: 'github_permission_denied', RAG_GITHUB_REPOSITORY_OR_REF_NOT_FOUND: 'github_repository_or_ref_not_found', RAG_GITHUB_CONFLICT: 'github_conflict', RAG_GITHUB_VALIDATION_FAILED: 'github_validation_failed', RAG_GITHUB_UPLOAD_FAILED: 'github_error', FILE_UPLOADED_METADATA_FAILED: 'metadata_failed' } as const)[error.code]
      const path = error.githubPath ? `&github_path=${encodeURIComponent(error.githubPath)}` : ''
      redirect(`/admin/concursos/${routeConcursoId}?material_status=${status}${path}`)
    }
    if (error instanceof RagGitHubConfigError) redirect(`/admin/concursos/${routeConcursoId}?material_status=github_config_missing`)
    redirect(`/admin/concursos/${routeConcursoId}?material_status=upload_error`)
  }
  revalidatePath(`/admin/concursos/${routeConcursoId}`)
  redirect(`/admin/concursos/${routeConcursoId}?material_status=uploaded&material_id=${materialId}`)
}

export async function startRagIngestionAction(
  routeConcursoId: number,
  _previousState: StartRagIngestionResult | null,
  formData: FormData,
): Promise<StartRagIngestionResult> {
  await requireAdmin()
  const materialId = Number(formData.get('material_id'))
  const admin = createAdminClient()

  try {
    await executeStartRagIngestion({
      async findMaterial(id) {
        const { data, error } = await admin.from('materiais_concurso')
          .select('id,concurso_id,ativo')
          .eq('id', id)
          .maybeSingle<{ id: number; concurso_id: number; ativo: boolean }>()
        if (error) throw error
        if (!data) return null
        const history = await admin.from('rag_ingestoes')
          .select('id', { count: 'exact', head: true })
          .eq('material_id', id)
          .eq('ingestion_version', 'rag-v2')
        if (history.error || history.count === null) throw history.error ?? new Error('Falha ao validar histórico RAG.')
        return { id: data.id, concursoId: data.concurso_id, active: data.ativo, hasRagV2History: history.count > 0 }
      },
      async ingest(id) {
        const serverConfig = getRagServerConfig()
        return await ingestMaterial(id, {
          repository: serverConfig.repository,
          pdf: createPdfJsTextExtractor(),
          embeddings: createGoogleEmbeddingClient({ apiKey: serverConfig.geminiApiKey, timeoutMs: RAG_CONFIG.embedding.timeoutMs }),
          persistence: createSupabaseRagPersistence(admin),
        })
      },
    }, routeConcursoId, materialId)
    revalidatePath(`/admin/concursos/${routeConcursoId}`)
    return successfulStartRagIngestion()
  } catch (error) {
    revalidatePath(`/admin/concursos/${routeConcursoId}`)
    return failedStartRagIngestion(error)
  }
}

export async function reprocessRagMaterialAction(
  routeConcursoId: number,
  _previousState: ReprocessRagResult | null,
  formData: FormData,
): Promise<ReprocessRagResult> {
  await requireAdmin()
  const materialId = Number(formData.get('material_id'))
  const admin = createAdminClient()

  try {
    await executeReprocessRag({
      async findMaterial(id) {
        const { data, error } = await admin.from('materiais_concurso')
          .select('id,concurso_id,ativo')
          .eq('id', id)
          .maybeSingle<{ id: number; concurso_id: number; ativo: boolean }>()
        if (error) throw error
        if (!data) return null
        const history = await admin.from('rag_ingestoes')
          .select('status,ativa')
          .eq('material_id', id)
          .eq('ingestion_version', 'rag-v2')
        if (history.error) throw history.error
        return {
          id: data.id,
          concursoId: data.concurso_id,
          active: data.ativo,
          activeRagV2Count: (history.data ?? []).filter((item) => item.ativa).length,
          activeCompletedRagV2Count: (history.data ?? []).filter((item) => item.ativa && item.status === 'concluida').length,
          processingRagV2Count: (history.data ?? []).filter((item) => item.status === 'processando').length,
        }
      },
      async reprocess(id) {
        const serverConfig = getRagServerConfig()
        return await reprocessMaterial(id, {
          repository: serverConfig.repository,
          pdf: createPdfJsTextExtractor(),
          embeddings: createGoogleEmbeddingClient({ apiKey: serverConfig.geminiApiKey, timeoutMs: RAG_CONFIG.embedding.timeoutMs }),
          persistence: createSupabaseRagPersistence(admin),
        })
      },
    }, routeConcursoId, materialId)
    revalidatePath(`/admin/concursos/${routeConcursoId}`)
    return successfulReprocessRag()
  } catch (error) {
    revalidatePath(`/admin/concursos/${routeConcursoId}`)
    return failedReprocessRag(error)
  }
}

export async function retryRagIngestionAction(
  routeConcursoId: number,
  _previousState: RetryRagResult | null,
  formData: FormData,
): Promise<RetryRagResult> {
  await requireAdmin()
  const materialId = Number(formData.get('material_id'))
  const admin = createAdminClient()

  try {
    await executeRetryRag({
      async findMaterial(id) {
        const { data, error } = await admin.from('materiais_concurso')
          .select('id,concurso_id,ativo')
          .eq('id', id)
          .maybeSingle<{ id: number; concurso_id: number; ativo: boolean }>()
        if (error) throw error
        if (!data) return null
        const history = await admin.from('rag_ingestoes')
          .select('status,ativa')
          .eq('material_id', id)
          .eq('ingestion_version', 'rag-v2')
        if (history.error) throw history.error
        const rows = history.data ?? []
        return {
          id: data.id,
          concursoId: data.concurso_id,
          active: data.ativo,
          historyCount: rows.length,
          failedRagV2Count: rows.filter((item) => item.status === 'erro' && !item.ativa).length,
          processingRagV2Count: rows.filter((item) => item.status === 'processando').length,
          activeCompletedRagV2Count: rows.filter((item) => item.status === 'concluida' && item.ativa).length,
        }
      },
      async retry(id) {
        const serverConfig = getRagServerConfig()
        return await retryFailedMaterialIngestion(id, {
          repository: serverConfig.repository,
          pdf: createPdfJsTextExtractor(),
          embeddings: createGoogleEmbeddingClient({ apiKey: serverConfig.geminiApiKey, timeoutMs: RAG_CONFIG.embedding.timeoutMs }),
          persistence: createSupabaseRagPersistence(admin),
        })
      },
    }, routeConcursoId, materialId)
    revalidatePath(`/admin/concursos/${routeConcursoId}`)
    return successfulRetryRag()
  } catch (error) {
    revalidatePath(`/admin/concursos/${routeConcursoId}`)
    return failedRetryRag(error)
  }
}
