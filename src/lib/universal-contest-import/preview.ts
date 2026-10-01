import type { SupabaseClient } from '@supabase/supabase-js'
import { expandProgramFile } from './expand'
import type { ContestFile, ImportPreviewItem, ImportStatus, ProgramFile, UniversalContentRow, UniversalImportPreview } from './types'

type ContestRow = { id: number; nome: string; orgao: string; banca: string | null; ano: number | null; edital: string | null }
type ExamRow = { id: number; codigo_prova: string | null; cargo: string | null; especialidade: string | null; turno: string | null }
type ContentRow = { id: number; prova_id: number; disciplina: string; assunto: string | null; subassunto: string | null; disciplina_ordem: number | null; assunto_ordem: number | null; subassunto_ordem: number | null }

export const PREVIEW_PAGE_SIZE = 1000

export async function fetchAllContestRows<T>(admin: SupabaseClient, table: 'provas' | 'conteudo_programatico', columns: string, contestId: number): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PREVIEW_PAGE_SIZE) {
    const { data, error } = await admin.from(table).select(columns).eq('concurso_id', contestId)
      .order('id', { ascending: true }).range(from, from + PREVIEW_PAGE_SIZE - 1)
    if (error) throw new Error(`Não foi possível paginar ${table}: ${error.message}`)
    const page = (data ?? []) as T[]
    rows.push(...page)
    if (page.length < PREVIEW_PAGE_SIZE) return rows
  }
}

const normalized = (value: string | null | undefined) => value?.trim() || null
const contentKey = (proof: string, row: Pick<UniversalContentRow, 'disciplina' | 'assunto' | 'subassunto'>) => [proof, row.disciplina, normalized(row.assunto) ?? '', normalized(row.subassunto) ?? ''].join('\u0000')

export function contestMatches(file: ContestFile, row: ContestRow) {
  return file.nome === row.nome && file.orgao === row.orgao && file.banca === row.banca && file.ano === row.ano && normalized(file.edital) === normalized(row.edital)
}

export function proofIdentityConflict(file: Pick<ProgramFile['provas'][number], 'cargo' | 'especialidade'>, row: Pick<ExamRow, 'cargo' | 'especialidade'>) {
  return file.cargo !== row.cargo || normalized(file.especialidade) !== normalized(row.especialidade)
}

export async function resolveContest(file: ContestFile, admin: SupabaseClient): Promise<ContestRow> {
  if (file.concurso_id) {
    const { data, error } = await admin.from('concursos').select('id, nome, orgao, banca, ano, edital').eq('id', file.concurso_id).maybeSingle()
    if (error) throw new Error(`Não foi possível validar o concurso: ${error.message}`)
    if (!data) throw new Error(`Concurso ${file.concurso_id} não encontrado no Supabase.`)
    const row = data as ContestRow
    if (!contestMatches(file, row)) throw new Error(`O concurso_id ${file.concurso_id} pertence a outro concurso. A importação foi bloqueada.`)
    return row
  }

  const { data, error } = await admin.from('concursos').select('id, nome, orgao, banca, ano, edital')
    .eq('nome', file.nome).eq('orgao', file.orgao).eq('banca', file.banca).eq('ano', file.ano)
  if (error) throw new Error(`Não foi possível resolver o concurso: ${error.message}`)
  const matches = ((data ?? []) as ContestRow[]).filter((row) => normalized(row.edital) === normalized(file.edital))
  if (matches.length === 0) throw new Error('Nenhum concurso do Supabase corresponde exatamente a nome, órgão, banca, ano e edital do arquivo.')
  if (matches.length > 1) throw new Error('Mais de um concurso corresponde aos metadados. Informe concurso_id para eliminar a ambiguidade.')
  return matches[0]
}

export async function buildUniversalPreview(file: ContestFile, program: ProgramFile, admin: SupabaseClient): Promise<UniversalImportPreview> {
  const contest = await resolveContest(file, admin)
  if (program.concurso_id != null && program.concurso_id !== contest.id) throw new Error(`conteudo-programatico.json aponta para concurso_id ${program.concurso_id}, mas o concurso resolvido é ${contest.id}.`)

  const [exams, existingContents] = await Promise.all([
    fetchAllContestRows<ExamRow>(admin, 'provas', 'id, codigo_prova, cargo, especialidade, turno', contest.id),
    fetchAllContestRows<ContentRow>(admin, 'conteudo_programatico', 'id, prova_id, disciplina, assunto, subassunto, disciplina_ordem, assunto_ordem, subassunto_ordem', contest.id),
  ])
  const examByCode = new Map<string, ExamRow>()
  const duplicateCodes = new Set<string>()
  for (const row of exams) {
    if (!row.codigo_prova) continue
    if (examByCode.has(row.codigo_prova)) duplicateCodes.add(row.codigo_prova)
    else examByCode.set(row.codigo_prova, row)
  }

  const errors: string[] = []
  const proofs: ImportPreviewItem[] = program.provas.map((proof) => {
    if (duplicateCodes.has(proof.codigo_prova)) {
      const detalhe = 'Há mais de uma prova com este código no Supabase.'
      errors.push(`${proof.codigo_prova}: ${detalhe}`)
      return { chave: proof.codigo_prova, titulo: `${proof.codigo_prova} · ${proof.cargo}`, status: 'conflito', detalhe }
    }
    const current = examByCode.get(proof.codigo_prova)
    if (!current) return { chave: proof.codigo_prova, titulo: `${proof.codigo_prova} · ${proof.cargo}`, status: 'novo' }
    if (proofIdentityConflict(proof, current)) {
      const detalhe = `Banco: ${current.cargo ?? '—'} / ${current.especialidade ?? '—'}; arquivo: ${proof.cargo} / ${proof.especialidade ?? '—'}.`
      errors.push(`${proof.codigo_prova}: cargo/especialidade incompatíveis.`)
      return { chave: proof.codigo_prova, titulo: `${proof.codigo_prova} · ${proof.cargo}`, status: 'conflito', detalhe }
    }
    const status: ImportStatus = normalized(current.turno) === normalized(proof.turno) ? 'existente' : 'atualizavel'
    return { chave: proof.codigo_prova, titulo: `${proof.codigo_prova} · ${proof.cargo}`, status, detalhe: status === 'atualizavel' ? 'O turno será atualizado.' : undefined }
  })

  const codeByExamId = new Map(exams.filter((row) => row.codigo_prova).map((row) => [row.id, row.codigo_prova as string]))
  const currentByKey = new Map<string, ContentRow[]>()
  for (const row of existingContents) {
    const code = codeByExamId.get(row.prova_id)
    if (!code) continue
    const key = contentKey(code, row)
    currentByKey.set(key, [...(currentByKey.get(key) ?? []), row])
  }
  const expanded = expandProgramFile(program)
  const contents: ImportPreviewItem[] = expanded.contents.map((row) => {
    const key = contentKey(row.prova_codigo, row)
    const matches = currentByKey.get(key) ?? []
    const title = `${row.prova_codigo} · ${[row.disciplina, row.assunto, row.subassunto].filter(Boolean).join(' › ')}`
    if (matches.length === 0) return { chave: key, titulo: title, status: 'novo' }
    if (matches.length > 1) {
      errors.push(`${title}: estrutura duplicada no Supabase.`)
      return { chave: key, titulo: title, status: 'conflito', detalhe: 'Estrutura duplicada no Supabase.' }
    }
    const current = matches[0]
    const sameOrder = current.disciplina_ordem === row.disciplina_ordem && current.assunto_ordem === row.assunto_ordem && current.subassunto_ordem === row.subassunto_ordem
    return { chave: key, titulo: title, status: sameOrder ? 'existente' : 'atualizavel', detalhe: sameOrder ? undefined : 'As ordens hierárquicas serão atualizadas.' }
  })

  const all = [...proofs, ...contents]
  const counts: Record<ImportStatus, number> = { novo: 0, existente: 0, atualizavel: 0, conflito: 0 }
  all.forEach((item) => { counts[item.status] += 1 })
  return {
    concurso: { ...file, id: contest.id }, resumo: expanded.totals, contagens: counts,
    provas: proofs, conteudos: contents, detalhes_provas: expanded.details, erros: errors,
    bloqueado: errors.length > 0,
  }
}
