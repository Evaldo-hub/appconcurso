'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, Database, FileStack, GitBranch, Layers3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { RagAdminMaterial, RagAdminMaterialStatus, RagAdminSnapshot } from '@/lib/rag/admin-status'
import { canStartInitialRagIngestion, type StartRagIngestionResult } from '@/lib/rag/admin-start-ingestion'
import { getReprocessingEligibility, type ReprocessRagResult } from '@/lib/rag/admin-reprocess-ingestion'
import { canRetryFailedRagIngestion, type RetryRagResult } from '@/lib/rag/admin-retry-ingestion'
import { NewRagMaterialForm } from './new-rag-material-form'
import { ReprocessRagButton } from './reprocess-rag-button'
import { StartRagButton } from './start-rag-button'
import { RetryRagButton } from './retry-rag-button'

type Filter = 'ALL' | 'READY' | 'PENDING' | 'ERROR' | 'DAILY_QUOTA_BLOCKED' | 'PROCESSING'
const labels: Record<RagAdminMaterialStatus, string> = { READY: 'Ready', PENDING: 'Pending', ERROR: 'Erro', DAILY_QUOTA_BLOCKED: 'Quota', PROCESSING: 'Processando' }
const styles: Record<RagAdminMaterialStatus, string> = {
  READY: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  PENDING: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
  ERROR: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
  DAILY_QUOTA_BLOCKED: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  PROCESSING: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
}

export function RagMaterialsPanel({ snapshot, contestName, exams, createAction, uploadAction, startAction, retryAction, reprocessAction, feedback }: { snapshot: RagAdminSnapshot; contestName: string; exams: Array<{ id: number; name: string }>; createAction: (formData: FormData) => Promise<void>; uploadAction: (formData: FormData) => Promise<void>; startAction: (state: StartRagIngestionResult | null, formData: FormData) => Promise<StartRagIngestionResult>; retryAction: (state: RetryRagResult | null, formData: FormData) => Promise<RetryRagResult>; reprocessAction: (state: ReprocessRagResult | null, formData: FormData) => Promise<ReprocessRagResult>; feedback?: { kind: 'success' | 'error'; message: string } }) {
  const [filter, setFilter] = useState<Filter>('ALL')
  const filters: Array<{ value: Filter; label: string }> = [
    { value: 'ALL', label: 'Todos' }, { value: 'READY', label: 'Ready' }, { value: 'PENDING', label: 'Pending' }, { value: 'ERROR', label: 'Erro' },
    ...(snapshot.summary.quotaBlocked > 0 ? [{ value: 'DAILY_QUOTA_BLOCKED' as const, label: 'Quota' }] : []),
    ...(snapshot.summary.processing > 0 ? [{ value: 'PROCESSING' as const, label: 'Processando' }] : []),
  ]
  const visible = useMemo(() => snapshot.materials.filter((material) => filter === 'ALL'
    || (filter === 'ERROR' ? material.ragStatus === 'ERROR' || material.ragStatus === 'DAILY_QUOTA_BLOCKED' : material.ragStatus === filter)), [filter, snapshot.materials])

  return <section className="space-y-4" aria-labelledby="rag-materials-title">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 id="rag-materials-title" className="text-xl font-bold">Materiais RAG</h2><p className="text-sm text-muted-foreground">Cadastro de fontes e observabilidade das ingestões e documentos RAG-V2.</p></div><NewRagMaterialForm contestName={contestName} exams={exams} action={createAction} uploadAction={uploadAction} /></div>
    {feedback && <p role="status" className={`rounded-md border p-3 text-sm ${feedback.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>{feedback.message}</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Metric title="Materiais" value={snapshot.summary.totalMaterials} icon={FileStack} />
      <Metric title="Ready" value={snapshot.summary.ready} icon={Database} />
      <Metric title="Pending" value={snapshot.summary.pending} icon={Layers3} />
      <Metric title="Erro" value={snapshot.summary.error} icon={Layers3} />
      <Metric title="Chunks ativos" value={snapshot.summary.activeChunks} icon={Layers3} />
      <Metric title="Documents ativos" value={snapshot.summary.activeDocuments} icon={Database} />
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Filtrar materiais RAG">{filters.map((item) => <Button key={item.value} type="button" size="sm" variant={filter === item.value ? 'default' : 'outline'} onClick={() => setFilter(item.value)}>{item.label}</Button>)}</div>
    {snapshot.materials.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhum material RAG cadastrado para este concurso.</CardContent></Card>
      : visible.length === 0 ? <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhum material corresponde ao filtro selecionado.</CardContent></Card>
        : <div className="space-y-3">{visible.map((material) => <MaterialCard key={material.materialId} material={material} startAction={startAction} retryAction={retryAction} reprocessAction={reprocessAction} />)}</div>}
  </section>
}

function Metric({ title, value, icon: Icon }: { title: string; value: number; icon: typeof Database }) {
  return <Card><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs text-muted-foreground">{title}</p><p className="text-2xl font-bold">{value}</p></div><Icon className="h-5 w-5 text-muted-foreground" /></CardContent></Card>
}

function MaterialCard({ material, startAction, retryAction, reprocessAction }: { material: RagAdminMaterial; startAction: (state: StartRagIngestionResult | null, formData: FormData) => Promise<StartRagIngestionResult>; retryAction: (state: RetryRagResult | null, formData: FormData) => Promise<RetryRagResult>; reprocessAction: (state: ReprocessRagResult | null, formData: FormData) => Promise<ReprocessRagResult> }) {
  const active = material.activeIngestion
  const reprocessing = getReprocessingEligibility(material)
  return <Card><CardHeader className="gap-3 p-4 sm:p-6"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><CardTitle className="text-base">{material.title}</CardTitle><StatusBadge status={material.ragStatus} />{!material.active && <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Material inativo</span>}</div><p className="mt-1 text-xs text-muted-foreground">Material #{material.materialId} · {material.provaId === null ? 'Material geral do concurso' : material.provaLabel ?? `Prova #${material.provaId}`}</p></div>{active && <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-sm sm:text-right"><span className="text-muted-foreground">Chunks</span><strong>{active.totalChunks}</strong><span className="text-muted-foreground">Documents</span><strong>{active.documentCount}</strong></div>}</div></CardHeader>
    <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0"><div className="grid gap-3 text-sm md:grid-cols-3"><Info label="Tipo" value={[material.fileType, material.sourceType].filter(Boolean).join(' · ') || 'Não informado'} /><Info label="Concurso" value={`#${material.concursoId}`} /><Info label="Ingestão ativa" value={active ? `#${active.ingestionId} · ${active.status}` : 'Nenhuma'} /></div>
      <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground"><GitBranch className="mt-0.5 h-4 w-4 shrink-0" /><span className="break-all">{material.githubPath || 'Caminho GitHub não informado'}</span></div>
      {canStartInitialRagIngestion(material) && <div className="flex items-end justify-between gap-4 rounded-md border p-3"><div className="text-sm"><p><span className="text-muted-foreground">Status:</span> PENDING</p><p><span className="text-muted-foreground">Documents:</span> 0</p></div><StartRagButton materialId={material.materialId} action={startAction} /></div>}
      {canRetryFailedRagIngestion(material) && <div className="flex items-end justify-between gap-4 rounded-md border p-3"><div className="text-sm"><p><span className="text-muted-foreground">Status:</span> RETRY_FAILED</p><p className="text-muted-foreground">A tentativa anterior falhou; o histórico será preservado.</p></div><RetryRagButton materialId={material.materialId} action={retryAction} /></div>}
      {reprocessing !== 'ineligible' && <div className="flex items-end justify-between gap-4 rounded-md border p-3"><div className="text-sm"><p><span className="text-muted-foreground">Status:</span> READY</p>{reprocessing === 'processing' && <p className="text-blue-700 dark:text-blue-300">Reprocessamento em andamento</p>}</div><ReprocessRagButton materialId={material.materialId} action={reprocessAction} disabled={reprocessing === 'processing'} /></div>}
      {active && <div className="grid gap-2 rounded-md border p-3 text-xs sm:grid-cols-2 lg:grid-cols-4"><Info label="Embedding" value={`${active.embeddingProvider} · ${active.embeddingModel}`} /><Info label="Dimensões" value={String(active.embeddingDimensions)} /><Info label="Versões" value={`${active.ingestionVersion} · ${active.chunkingVersion}`} /><Info label="Criada em" value={formatDate(active.createdAt)} /></div>}
      {material.ingestionHistory.length > 0 && <details className="group rounded-md border"><summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-medium">Ver histórico ({material.ingestionHistory.length})<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></summary><div className="border-t"><div className="space-y-3 p-3">{material.ingestionHistory.map((ingestion) => <div key={ingestion.ingestionId} className="rounded-md bg-muted/40 p-3 text-xs"><div className="flex flex-wrap items-center gap-2"><strong>Ingestão #{ingestion.ingestionId}</strong><span>{ingestion.status}</span><span>{ingestion.active ? 'ativa' : 'inativa'}</span></div><div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-4"><span>Chunks: {ingestion.totalChunks}</span><span>Documents: {ingestion.documentCount}</span><span>Início: {formatDate(ingestion.startedAt)}</span><span>Conclusão: {ingestion.concludedAt ? formatDate(ingestion.concludedAt) : '—'}</span></div>{ingestion.error && <p className="mt-2 break-words rounded border border-red-200 bg-red-50 p-2 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{ingestion.error}</p>}</div>)}</div></div></details>}
    </CardContent></Card>
}

function StatusBadge({ status }: { status: RagAdminMaterialStatus }) { return <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${styles[status]}`}>{labels[status]}</span> }
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-muted-foreground">{label}</p><p className="font-medium">{value}</p></div> }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Data indisponível' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date) }
