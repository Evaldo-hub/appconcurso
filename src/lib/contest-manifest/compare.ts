import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContestManifestPreview, DiffStatus, ExpandedContentRow, ExpandedManifest, PreviewItem } from './types'

type ContestRow = { id: number; slug: string; nome: string; orgao: string; banca: string | null; ano: number | null; edital: string | null; data_prova: string | null; descricao: string | null }
type ExamRow = { id: number; codigo_prova: string | null; nome: string; cargo: string | null; especialidade: string | null; turno: string | null; arquivo_origem: string | null; ativo: boolean }
type ContentRow = { prova_id: number; disciplina: string; assunto: string | null; subassunto: string | null; ordem: number | null; ativo: boolean; disciplina_ordem: number | null; assunto_ordem: number | null; subassunto_ordem: number | null }
type MaterialRow = { prova_id: number | null; disciplina: string | null; assunto: string | null; subassunto: string | null; titulo: string; arquivo_origem: string | null; github_path: string | null; tipo_arquivo: string | null; ativo: boolean; tipo_fonte: string | null }

const same = (left: unknown[], right: unknown[]) => left.length === right.length && left.every((value, index) => value === right[index])
const contentKey = (proof: string, row: Pick<ExpandedContentRow, 'disciplina' | 'assunto' | 'subassunto'>) => [proof, row.disciplina, row.assunto ?? '', row.subassunto ?? ''].join('\u0000')
const contentTitle = (proof: string, row: Pick<ExpandedContentRow, 'disciplina' | 'assunto' | 'subassunto'>) => `${proof} · ${[row.disciplina, row.assunto, row.subassunto].filter(Boolean).join(' › ')}`

export function contentRowsMatch(current: Pick<ContentRow, 'ativo' | 'disciplina_ordem' | 'assunto_ordem' | 'subassunto_ordem'>, expected: Pick<ExpandedContentRow, 'ativo' | 'disciplina_ordem' | 'assunto_ordem' | 'subassunto_ordem'>) {
  return same(
    [current.ativo, current.disciplina_ordem, current.assunto_ordem, current.subassunto_ordem],
    [expected.ativo, expected.disciplina_ordem, expected.assunto_ordem, expected.subassunto_ordem],
  )
}

export async function compareContestManifest(expanded: ExpandedManifest, admin: SupabaseClient): Promise<ContestManifestPreview> {
  const manifest = expanded.manifesto
  const { data: contestData, error: contestError } = await admin.from('concursos').select('id, slug, nome, orgao, banca, ano, edital, data_prova, descricao').eq('slug', manifest.slug).maybeSingle()
  if (contestError) throw new Error(`Não foi possível consultar o concurso: ${contestError.message}`)
  const contest = contestData as ContestRow | null
  const contestStatus = !contest ? 'novo' : same([contest.nome, contest.orgao, contest.banca, contest.ano, contest.edital, contest.data_prova, contest.descricao], [manifest.nome, manifest.orgao, manifest.banca, manifest.ano, manifest.edital, manifest.data_prova, manifest.descricao]) ? 'sem_alteracao' : 'alterado'

  let existingExams: ExamRow[] = []
  let existingContents: ContentRow[] = []
  let existingMaterials: MaterialRow[] = []
  if (contest) {
    const [examResult, contentResult, materialResult] = await Promise.all([
      admin.from('provas').select('id, codigo_prova, nome, cargo, especialidade, turno, arquivo_origem, ativo').eq('concurso_id', contest.id),
      admin.from('conteudo_programatico').select('prova_id, disciplina, assunto, subassunto, ordem, ativo, disciplina_ordem, assunto_ordem, subassunto_ordem').eq('concurso_id', contest.id),
      admin.from('materiais_concurso').select('prova_id, disciplina, assunto, subassunto, titulo, arquivo_origem, github_path, tipo_arquivo, ativo, tipo_fonte').eq('concurso_id', contest.id),
    ])
    const error = examResult.error || contentResult.error || materialResult.error
    if (error) throw new Error(`Não foi possível comparar o manifesto: ${error.message}`)
    existingExams = (examResult.data ?? []) as ExamRow[]
    existingContents = (contentResult.data ?? []) as ContentRow[]
    existingMaterials = (materialResult.data ?? []) as MaterialRow[]
  }

  const examByCode = new Map(existingExams.filter((row) => row.codigo_prova).map((row) => [row.codigo_prova as string, row]))
  const codeByExamId = new Map(existingExams.map((row) => [row.id, row.codigo_prova ?? `id:${row.id}`]))
  const proofs: PreviewItem[] = manifest.provas.map((proof) => {
    const current = examByCode.get(proof.codigo)
    const status: DiffStatus = !current ? 'inserir' : same([current.nome, current.cargo, current.especialidade, current.turno, current.arquivo_origem, current.ativo], [proof.nome, proof.cargo, proof.especialidade, proof.turno, proof.arquivo_origem, proof.ativo]) ? 'sem_alteracao' : 'atualizar'
    return { chave: proof.codigo, titulo: `${proof.codigo} · ${proof.nome}`, status, prova_codigo: proof.codigo }
  })
  const manifestCodes = new Set(manifest.provas.map((proof) => proof.codigo))
  existingExams.filter((row) => !row.codigo_prova || !manifestCodes.has(row.codigo_prova)).forEach((row) => proofs.push({ chave: row.codigo_prova ?? `id:${row.id}`, titulo: `${row.codigo_prova ?? `ID ${row.id}`} · ${row.nome}`, status: 'somente_supabase', prova_codigo: row.codigo_prova ?? undefined }))

  const currentContentByKey = new Map(existingContents.map((row) => { const proof = codeByExamId.get(row.prova_id) ?? `id:${row.prova_id}`; return [contentKey(proof, row), row] }))
  const contents: PreviewItem[] = expanded.conteudos.map((row) => {
    const key = contentKey(row.prova_codigo, row)
    const current = currentContentByKey.get(key)
    const status: DiffStatus = !current ? 'inserir' : contentRowsMatch(current, row) ? 'sem_alteracao' : 'atualizar'
    return { chave: key, titulo: contentTitle(row.prova_codigo, row), status, prova_codigo: row.prova_codigo }
  })
  const manifestContentKeys = new Set(contents.map((item) => item.chave))
  currentContentByKey.forEach((row, key) => { if (!manifestContentKeys.has(key)) { const proof = codeByExamId.get(row.prova_id) ?? `id:${row.prova_id}`; contents.push({ chave: key, titulo: contentTitle(proof, { disciplina: row.disciplina, assunto: row.assunto, subassunto: row.subassunto }), status: 'somente_supabase', prova_codigo: proof }) } })

  const materialByPath = new Map(existingMaterials.filter((row) => row.github_path).map((row) => [row.github_path as string, row]))
  const materials: PreviewItem[] = manifest.materiais.map((material) => {
    const current = materialByPath.get(material.arquivo)
    const expectedProofId = material.prova_codigo ? examByCode.get(material.prova_codigo)?.id ?? null : null
    const status: DiffStatus = !current ? 'inserir' : same([current.prova_id, current.disciplina, current.assunto, current.subassunto, current.titulo, current.arquivo_origem, current.tipo_arquivo, current.ativo, current.tipo_fonte], [expectedProofId, material.disciplina, material.assunto, material.subassunto, material.titulo, material.arquivo, material.tipo_arquivo, material.ativo, material.tipo_fonte]) ? 'sem_alteracao' : 'atualizar'
    return { chave: material.arquivo, titulo: material.titulo, status, prova_codigo: material.prova_codigo ?? undefined }
  })
  const manifestMaterialPaths = new Set(manifest.materiais.map((item) => item.arquivo))
  existingMaterials.filter((row) => row.github_path && !manifestMaterialPaths.has(row.github_path)).forEach((row) => materials.push({ chave: row.github_path as string, titulo: row.titulo, status: 'somente_supabase', prova_codigo: row.prova_id ? codeByExamId.get(row.prova_id) : undefined }))

  return { concurso: { id: contest?.id ?? null, slug: manifest.slug, nome: manifest.nome, orgao: manifest.orgao, banca: manifest.banca, ano: manifest.ano, status: contestStatus }, resumo: expanded.totais, provas: proofs, conteudos: contents, materiais: materials, detalhes_provas: expanded.provas.map((proof) => ({ codigo: proof.codigo, nome: proof.nome, cargo: proof.cargo, especialidade: proof.especialidade, ...proof.totais })) }
}
