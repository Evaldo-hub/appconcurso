'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { useFormStatus } from 'react-dom'
import { Plus, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { exceedsRagUploadLimit } from '@/lib/rag/upload-limits'
import { disciplineAfterProofChange, listRagMaterialDisciplines } from '@/lib/rag/admin-material-discipline'
import type { NormalizedSelectionTaxonomy } from '@/lib/contest-catalog/selection'

type ExamOption = { id: number; name: string }

export function NewRagMaterialForm({
  contestName,
  contestId,
  exams,
  taxonomy,
  action,
  uploadAction,
}: {
  contestName: string
  contestId: number
  exams: ExamOption[]
  taxonomy: NormalizedSelectionTaxonomy[]
  action: (formData: FormData) => Promise<void>
  uploadAction: (formData: FormData) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'reference' | 'upload'>('reference')
  const [proofId, setProofId] = useState('')
  const [discipline, setDiscipline] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const catalog = useMemo(() => ({ contests: [], exams: [], taxonomy }), [taxonomy])
  const disciplines = useMemo(
    () => listRagMaterialDisciplines(catalog, contestId, proofId ? Number(proofId) : null),
    [catalog, contestId, proofId],
  )
  const changeProof = (nextProofId: string) => {
    const nextDisciplines = listRagMaterialDisciplines(catalog, contestId, nextProofId ? Number(nextProofId) : null)
    setProofId(nextProofId)
    setDiscipline((current) => disciplineAfterProofChange(current, nextDisciplines))
  }
  const validateSelectedFile = (file: File | null) => {
    const error = file && exceedsRagUploadLimit(file.size) ? 'O arquivo excede o limite de 25 MiB.' : null
    setUploadError(error)
    return error === null
  }
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (mode !== 'upload') return
    const file = new FormData(event.currentTarget).get('arquivo')
    if (!(file instanceof File) || !validateSelectedFile(file)) event.preventDefault()
  }
  if (!open) return <Button type="button" onClick={() => setOpen(true)}><Plus />Novo material</Button>

  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="new-rag-material-title">
    <Card className="my-4 w-full max-w-3xl">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div><CardTitle id="new-rag-material-title">Novo material RAG</CardTitle><p className="mt-1 text-sm text-muted-foreground">Concurso: {contestName}. O cadastro não inicia ingestão.</p></div>
        <Button type="button" variant="ghost" size="icon" aria-label="Cancelar cadastro" onClick={() => setOpen(false)}><X /></Button>
      </CardHeader>
      <CardContent>
        <form action={mode === 'reference' ? action : uploadAction} onSubmit={handleSubmit} className="space-y-4">
          <fieldset className="space-y-2"><legend className="text-sm font-medium">Origem</legend><div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" name="source_mode" checked={mode === 'reference'} onChange={() => setMode('reference')} />Arquivo já existente</label><label className="flex items-center gap-2"><input type="radio" name="source_mode" checked={mode === 'upload'} onChange={() => setMode('upload')} />Enviar novo arquivo</label></div></fieldset>
          <div className="grid gap-4 md:grid-cols-2">
            <Field name="titulo" label="Título" required maxLength={300} />
            <label className="space-y-2"><Label htmlFor="rag-prova">Prova</Label><select id="rag-prova" name="prova_id" value={proofId} onChange={(event) => changeProof(event.currentTarget.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"><option value="">Material geral do concurso</option>{exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.name}</option>)}</select></label>
            <label className="space-y-2"><Label htmlFor="rag-categoria-documental">Categoria documental</Label><select id="rag-categoria-documental" name="categoria_documental" defaultValue="" required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"><option value="" disabled>Selecione a categoria</option><option value="EDITAL">Edital</option><option value="NORMA_OFICIAL">Norma oficial</option><option value="MANUAL_OFICIAL">Manual oficial</option><option value="DOCUMENTACAO_TECNICA_OFICIAL">Documentação técnica oficial</option><option value="PROVA_ANTERIOR">Prova anterior</option><option value="MATERIAL_EXPLICATIVO">Material explicativo</option><option value="OUTRO">Outro</option></select></label>
            {mode === 'reference' ? <><label className="space-y-2"><Label htmlFor="rag-tipo-arquivo">Tipo de arquivo</Label><select id="rag-tipo-arquivo" name="tipo_arquivo" defaultValue="pdf" required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"><option value="pdf">PDF</option><option value="txt">TXT</option><option value="md">Markdown</option></select></label><Field name="arquivo_origem" label="Nome do arquivo de origem" maxLength={500} /></> : <><label className="space-y-2"><Label htmlFor="rag-categoria">Categoria</Label><select id="rag-categoria" name="categoria" defaultValue="documentos_gerais" required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"><option value="documentos_gerais">Documentos gerais</option><option value="edital">Edital</option></select></label><label className="space-y-2"><Label htmlFor="rag-arquivo">Arquivo</Label><Input id="rag-arquivo" name="arquivo" type="file" accept=".pdf,.txt,.md" required onChange={(event) => validateSelectedFile(event.currentTarget.files?.[0] ?? null)} /></label></>}
            <label className="space-y-2"><Label htmlFor="rag-disciplina">Disciplina</Label><select id="rag-disciplina" name="disciplina" value={discipline} onChange={(event) => setDiscipline(event.currentTarget.value)} required disabled={disciplines.length === 0} aria-describedby={disciplines.length === 0 ? 'rag-disciplina-empty' : undefined} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"><option value="" disabled>Selecione a disciplina</option>{disciplines.map((item) => <option key={item} value={item}>{item}</option>)}</select>{disciplines.length === 0 && <span id="rag-disciplina-empty" className="block text-xs text-muted-foreground">Nenhuma disciplina disponível para esta seleção.</span>}</label>
            <Field name="assunto" label="Assunto" maxLength={300} />
            <Field name="subassunto" label="Subassunto" maxLength={300} />
            {mode === 'reference' && <div className="md:col-span-2"><Field name="github_path" label="Caminho no GitHub" required maxLength={2000} placeholder="concursos/trt8/2022/documentos_gerais/arquivo.pdf" /></div>}
          </div>
          {uploadError && <p role="alert" className="text-sm text-destructive">{uploadError}</p>}
          <p className="text-xs text-muted-foreground">{mode === 'reference' ? 'O caminho será preservado exatamente após remover espaços nas extremidades.' : 'PDF, TXT ou Markdown, até 25 MiB. O servidor define o caminho e nunca sobrescreve arquivos.'}</p>
          <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><SubmitButton uploading={mode === 'upload'} /></div>
        </form>
      </CardContent>
    </Card>
  </div>
}

function Field({ name, label, required = false, maxLength, placeholder }: { name: string; label: string; required?: boolean; maxLength: number; placeholder?: string }) {
  return <label className="space-y-2"><Label htmlFor={`rag-${name}`}>{label}</Label><Input id={`rag-${name}`} name={name} required={required} maxLength={maxLength} placeholder={placeholder} /></label>
}

function SubmitButton({ uploading }: { uploading: boolean }) {
  const { pending } = useFormStatus()
  return <Button type="submit" disabled={pending}><Save />{pending ? (uploading ? 'Enviando material...' : 'Salvando…') : (uploading ? 'Enviar material' : 'Salvar material')}</Button>
}
