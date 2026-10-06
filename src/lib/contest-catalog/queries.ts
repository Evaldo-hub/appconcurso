import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  buildNormalizedSelectionTaxonomy,
  type NormalizedCatalogContentRow,
  type NormalizedCatalogLinkRow,
  type NormalizedSelectionCatalog,
  type NormalizedSelectionContest,
  type NormalizedSelectionExam,
} from './selection'

export interface NormalizedSelectionCatalogResult {
  catalog: NormalizedSelectionCatalog
  error: string | null
}

const emptyCatalog: NormalizedSelectionCatalog = { contests: [], exams: [], taxonomy: [] }
const normalizedText = (value: unknown) => typeof value === 'string' ? value.trim() : ''

export async function listarProvasDoConcurso(contestId: number): Promise<NormalizedSelectionExam[]> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('provas')
    .select('id, concurso_id, codigo_prova, nome, cargo, especialidade')
    .eq('concurso_id', contestId)
    .eq('ativo', true)
    .order('codigo_prova', { ascending: true })
  if (error) throw new Error('CATALOGO_PROVAS_INDISPONIVEL')
  return (data ?? []).map((row) => ({
    id: Number(row.id),
    contestId: Number(row.concurso_id),
    code: normalizedText(row.codigo_prova),
    name: normalizedText(row.nome),
    role: normalizedText(row.cargo) || null,
    specialty: normalizedText(row.especialidade) || null,
  }))
}

export async function loadNormalizedTaxonomyForContest(admin: SupabaseClient, contestId: number) {
  const [linksResult, contentsResult] = await Promise.all([
    admin.from('prova_conteudos')
      .select('prova_id, conteudo_id, concurso_id, ativo, disciplina_ordem, assunto_ordem, subassunto_ordem, ordem')
      .eq('concurso_id', contestId)
      .eq('ativo', true)
      .order('prova_id', { ascending: true })
      .order('disciplina_ordem', { ascending: true, nullsFirst: false })
      .order('assunto_ordem', { ascending: true, nullsFirst: false })
      .order('subassunto_ordem', { ascending: true, nullsFirst: false })
      .order('ordem', { ascending: true, nullsFirst: false })
      .range(0, 4999),
    admin.from('conteudos_catalogo')
      .select('id, concurso_id, disciplina, assunto, subassunto, ativo')
      .eq('concurso_id', contestId)
      .eq('ativo', true)
      .range(0, 4999),
  ])
  if (linksResult.error || contentsResult.error) throw new Error('CATALOGO_TAXONOMIA_INDISPONIVEL')
  return buildNormalizedSelectionTaxonomy(
    (linksResult.data ?? []) as NormalizedCatalogLinkRow[],
    (contentsResult.data ?? []) as NormalizedCatalogContentRow[],
  )
}

export async function loadAuthorizedNormalizedCatalogBySlug(slug: string): Promise<NormalizedSelectionCatalogResult> {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return { catalog: emptyCatalog, error: 'Sua sessão expirou. Entre novamente.' }

  const admin = createAdminClient()
  const { data: contestRow, error: contestError } = await admin.from('concursos')
    .select('id, slug, nome, ano, banca')
    .eq('slug', slug)
    .maybeSingle()
  if (contestError || !contestRow) return { catalog: emptyCatalog, error: 'Concurso não encontrado.' }

  const contestId = Number(contestRow.id)
  const { data: allowed, error: accessError } = await userClient.rpc('usuario_pode_acessar_concurso', { p_concurso_id: contestId })
  if (accessError || allowed !== true) return { catalog: emptyCatalog, error: 'Você não possui acesso a este concurso.' }

  try {
    const [exams, taxonomy] = await Promise.all([listarProvasDoConcurso(contestId), loadNormalizedTaxonomyForContest(admin, contestId)])
    const contest: NormalizedSelectionContest = {
      id: contestId,
      slug: normalizedText(contestRow.slug),
      name: normalizedText(contestRow.nome),
      year: typeof contestRow.ano === 'number' ? contestRow.ano : null,
      board: normalizedText(contestRow.banca),
    }
    return { catalog: { contests: [contest], exams, taxonomy }, error: null }
  } catch {
    return { catalog: emptyCatalog, error: 'Não foi possível carregar o catálogo programático.' }
  }
}
