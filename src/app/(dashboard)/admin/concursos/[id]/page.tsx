import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { ConcursoForm, ProvaForm } from '../ui'
import { loadRagAdminSnapshot } from '@/lib/rag/admin-observability'
import { RagMaterialsPanel } from './rag-materials-panel'
import { reprocessRagMaterialAction, retryRagIngestionAction, saveRagMaterialAction, startRagIngestionAction, uploadRagMaterialAction } from '../actions'
import { loadNormalizedTaxonomyForContest } from '@/lib/contest-catalog/queries'

export const dynamic = 'force-dynamic'

export default async function EditContestPage({ params, searchParams }: PageProps<'/admin/concursos/[id]'>) {
  const { id } = await params
  const query = await searchParams
  if (!/^\d+$/.test(id)) notFound()
  const admin = createAdminClient()
  const [{ data: contest }, { data: exams }, ragResult, taxonomyResult] = await Promise.all([
    admin.from('concursos').select('id, nome, orgao, banca, ano, edital, cargo, especialidade, data_prova, descricao').eq('id', id).maybeSingle(),
    admin.from('provas').select('id, concurso_id, nome, cargo, especialidade, codigo_prova, turno').eq('concurso_id', id).order('codigo_prova'),
    loadRagAdminSnapshot(admin, Number(id)).then((snapshot) => ({ snapshot, error: false as const })).catch(() => ({ snapshot: null, error: true as const })),
    loadNormalizedTaxonomyForContest(admin, Number(id)).then((taxonomy) => ({ taxonomy, error: false as const })).catch(() => ({ taxonomy: [], error: true as const })),
  ])
  if (!contest) notFound()
  const materialStatus = typeof query.material_status === 'string' ? query.material_status : null
  const recoveryPath = typeof query.github_path === 'string' ? query.github_path : null
  const feedback = materialStatus === 'created' ? { kind: 'success' as const, message: 'Material cadastrado. A ingestão RAG ainda não foi iniciada.' }
    : materialStatus === 'uploaded' ? { kind: 'success' as const, message: 'Material enviado e cadastrado. A ingestão RAG ainda não foi iniciada.' }
      : materialStatus ? { kind: 'error' as const, message: ({ invalid: 'Revise os campos obrigatórios do material.', exam: 'A prova selecionada não pertence a este concurso.', discipline: 'A disciplina selecionada não pertence ao catálogo desta prova ou concurso.', duplicate: 'Já existe um material com essa origem para o concurso e a prova selecionados.', contest: 'O concurso informado não é válido.', github_file_not_found: 'O arquivo informado não foi encontrado no GitHub.', github_file_check_failed: 'Não foi possível validar o arquivo no GitHub.', error: 'Não foi possível cadastrar o material.', upload_invalid: 'O arquivo ou seus metadados são inválidos.', upload_large: 'O arquivo excede o limite de 25 MiB.', github_config_missing: 'Configuração GitHub incompleta no servidor. Código: RAG_GITHUB_CONFIG_MISSING', github_auth_failed: 'Não foi possível autenticar no GitHub. Código: RAG_GITHUB_AUTH_FAILED', github_permission_denied: 'O GitHub recusou a permissão de escrita. Código: RAG_GITHUB_PERMISSION_DENIED', github_repository_or_ref_not_found: 'Repositório ou branch não encontrado pelo GitHub. Código: RAG_GITHUB_REPOSITORY_OR_REF_NOT_FOUND', github_conflict: 'Já existe um arquivo nesse caminho no GitHub; nenhum dado foi sobrescrito. Código: RAG_GITHUB_CONFLICT', github_validation_failed: 'O GitHub recusou os dados do arquivo. Código: RAG_GITHUB_VALIDATION_FAILED', github_error: 'Não foi possível enviar o arquivo ao GitHub; nenhum material foi cadastrado. Código: RAG_GITHUB_UPLOAD_FAILED', upload_error: 'Não foi possível concluir o envio do material.', metadata_failed: `Arquivo enviado, mas o cadastro do material falhou. Recuperação manual necessária${recoveryPath ? `: ${recoveryPath}` : '.'}` } as Record<string, string>)[materialStatus] ?? 'Não foi possível cadastrar o material.' } : undefined
  const createMaterial = saveRagMaterialAction.bind(null, Number(id))
  const uploadMaterial = uploadRagMaterialAction.bind(null, Number(id))
  const startIngestion = startRagIngestionAction.bind(null, Number(id))
  const reprocessIngestion = reprocessRagMaterialAction.bind(null, Number(id))
  const retryIngestion = retryRagIngestionAction.bind(null, Number(id))
  const ragFeedback = taxonomyResult.error
    ? { kind: 'error' as const, message: 'Não foi possível carregar as disciplinas do catálogo.' }
    : feedback
  return <div className="space-y-8"><ConcursoForm contest={contest} saved={query.salvo === '1'} error={typeof query.erro === 'string' ? query.erro : null} /><section className="space-y-4"><h2 className="text-xl font-bold">Provas</h2><ProvaForm contestId={String(contest.id)} />{(exams ?? []).map((exam) => <ProvaForm key={exam.id} contestId={String(contest.id)} exam={exam} />)}</section>{ragResult.error || !ragResult.snapshot ? <section className="space-y-2"><h2 className="text-xl font-bold">Materiais RAG</h2><p className="rounded-md border border-destructive p-4 text-sm text-destructive">Não foi possível consultar o status dos materiais RAG.</p></section> : <RagMaterialsPanel snapshot={ragResult.snapshot} contestId={Number(contest.id)} contestName={contest.nome} exams={(exams ?? []).map((exam) => ({ id: exam.id, name: exam.nome }))} taxonomy={taxonomyResult.taxonomy} createAction={createMaterial} uploadAction={uploadMaterial} startAction={startIngestion} retryAction={retryIngestion} reprocessAction={reprocessIngestion} feedback={ragFeedback} />}</div>
}
