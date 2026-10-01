'use client'

import { useActionState } from 'react'
import { Loader2, ShieldCheck, Upload } from 'lucide-react'
import { previewUniversalImportAction, confirmUniversalImportAction } from './actions'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ImportPreviewItem, ImportStatus, UniversalImportState } from '@/lib/universal-contest-import/types'

const initialState: UniversalImportState = { ok: false, message: null, errors: [], preview: null }
const labels: Record<ImportStatus, string> = { novo: 'Novo', existente: 'Já existente', atualizavel: 'Atualizável', conflito: 'Conflito' }

export function UniversalContestImportForm() {
  const [state, previewAction, previewPending] = useActionState(previewUniversalImportAction, initialState)
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmUniversalImportAction, initialState)
  const preview = state.preview
  return <div className="space-y-6">
    <Card><CardHeader><CardTitle>Arquivos da importação</CardTitle></CardHeader><CardContent>
      <form action={previewAction} className="space-y-4">
        <FileInput name="concurso" label="concurso.json" />
        <FileInput name="conteudoProgramatico" label="conteudo-programatico.json" />
        <p className="text-xs text-muted-foreground">Até 2 MiB por arquivo. A validação ocorre no servidor e não grava dados.</p>
        <Button type="submit" disabled={previewPending}>{previewPending ? <Loader2 className="animate-spin" /> : <Upload />}{previewPending ? 'Validando...' : 'Validar arquivos'}</Button>
      </form>
    </CardContent></Card>

    <Messages state={state} />
    <Messages state={confirmState} />

    {preview && <>
      <Card><CardHeader><CardTitle>Preview</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        <p><strong>Concurso:</strong> {preview.concurso.nome}</p><p><strong>Órgão:</strong> {preview.concurso.orgao}</p><p><strong>Banca:</strong> {preview.concurso.banca}</p><p><strong>Ano:</strong> {preview.concurso.ano}</p><p><strong>ID resolvido no Supabase:</strong> {preview.concurso.id}</p>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Resumo</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Object.entries(preview.resumo).map(([name, value]) => <Metric key={name} label={name} value={value} />)}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Classificação</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(Object.keys(labels) as ImportStatus[]).map((status) => <Metric key={status} label={labels[status]} value={preview.contagens[status]} danger={status === 'conflito'} />)}
      </CardContent></Card>
      {preview.erros.length > 0 && <Alert variant="destructive"><strong>Erros bloqueantes</strong><ul className="mt-2 list-disc pl-5">{preview.erros.map((error) => <li key={error}>{error}</li>)}</ul></Alert>}
      <Card><CardHeader><CardTitle>Provas</CardTitle></CardHeader><CardContent className="space-y-3">
        {preview.detalhes_provas.map((proof) => <details key={proof.codigo} className="rounded border p-3"><summary className="cursor-pointer font-semibold">{proof.codigo} · {proof.cargo}{proof.especialidade ? ` · ${proof.especialidade}` : ''}</summary><p className="mt-2 text-sm">{proof.disciplinas} disciplina(s) · {proof.assuntos} assunto(s)</p>{proof.escolaridade && <p className="mt-1 text-xs text-muted-foreground">Escolaridade: {proof.escolaridade} (metadado do arquivo; não será persistido)</p>}<ItemList items={[...preview.provas, ...preview.conteudos].filter((item) => item.chave === proof.codigo || item.chave.startsWith(`${proof.codigo}\u0000`))} /></details>)}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Confirmar importação</CardTitle></CardHeader><CardContent className="space-y-4">
        <p className="text-sm">A confirmação só é liberada sem erros ou conflitos. A gravação é revalidada e executada em uma transação.</p>
        <form action={confirmAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="sourcesBase64" value={state.sourcesBase64 ?? ''} /><input type="hidden" name="sourceHash" value={state.sourceHash ?? ''} /><input type="hidden" name="previewToken" value={state.previewToken ?? ''} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirmImport" value="confirmado" required disabled={preview.bloqueado} />Revisei o Preview e autorizo a importação.</label>
          <Button type="submit" disabled={preview.bloqueado || confirmPending}>{confirmPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}{confirmPending ? 'Importando...' : 'Confirmar importação'}</Button>
          <Button type="reset" variant="outline">Cancelar</Button>
        </form>
      </CardContent></Card>
    </>}
    {confirmState.result && <Alert>Importação concluída: {confirmState.result.provas.inseridos} prova(s) e {confirmState.result.conteudos.inseridos} conteúdo(s) novos.</Alert>}
  </div>
}

function FileInput({ name, label }: { name: string; label: string }) { return <label className="block space-y-2 text-sm font-medium"><span>{label}</span><input name={name} type="file" accept="application/json,.json" required className="block w-full rounded-md border bg-background p-2 text-sm" /></label> }
function Metric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) { return <div className={`rounded border p-3 text-center ${danger && value ? 'border-destructive text-destructive' : ''}`}><p className="text-2xl font-bold">{value}</p><p className="text-xs capitalize">{label.replace('_', ' ')}</p></div> }
function Messages({ state }: { state: UniversalImportState }) { return <>{state.message && <Alert variant={state.ok ? 'default' : 'destructive'}>{state.message}</Alert>}{state.errors.length > 0 && <Card><CardHeader><CardTitle>Erros de validação</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm">{state.errors.map((error, index) => <li key={`${error.path}-${index}`} className="rounded border border-destructive/40 p-3"><code className="font-semibold text-destructive">{error.path}</code><p>{error.message}</p></li>)}</ul></CardContent></Card>}</> }
function ItemList({ items }: { items: ImportPreviewItem[] }) { return <ul className="mt-3 max-h-80 space-y-1 overflow-auto text-sm">{items.map((item) => <li key={item.chave} className="rounded border p-2"><div className="flex justify-between gap-3"><span>{item.titulo}</span><strong>{labels[item.status]}</strong></div>{item.detalhe && <p className="mt-1 text-xs text-muted-foreground">{item.detalhe}</p>}</li>)}</ul> }
