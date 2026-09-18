import Link from 'next/link'
import { Save } from 'lucide-react'
import { saveConcursoAction, saveProvaAction } from './actions'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Contest = { id: number; nome: string; orgao: string; banca: string | null; ano: number | null; edital: string | null; cargo: string | null; especialidade: string | null; data_prova: string | null; descricao: string | null }
type Exam = { id: number; nome: string; cargo: string | null; especialidade: string | null; codigo_prova: string | null; turno: string | null }

export function ConcursoForm({ contest, saved = false, error = null }: { contest: Contest | null; saved?: boolean; error?: string | null }) {
  return <div className="space-y-4"><Link href="/admin/concursos" className="text-sm text-muted-foreground hover:text-foreground">← Voltar aos concursos</Link>{saved && <Alert>Dados salvos com sucesso.</Alert>}{error && <Alert variant="destructive">Revise os campos ou confirme a migration da Fase 18.</Alert>}<form action={saveConcursoAction}><input type="hidden" name="id" value={contest?.id ?? ''} /><Card><CardHeader><CardTitle>{contest ? `Editar ${contest.nome}` : 'Novo concurso'}</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><Field name="nome" label="Nome" value={contest?.nome} required /><Field name="orgao" label="Órgão" value={contest?.orgao} required /><Field name="banca" label="Banca" value={contest?.banca} /><Field name="ano" label="Ano" value={contest?.ano} type="number" /><Field name="edital" label="Edital" value={contest?.edital} /><Field name="cargo" label="Cargo" value={contest?.cargo} /><Field name="especialidade" label="Especialidade" value={contest?.especialidade} /><Field name="data_prova" label="Data da prova" value={contest?.data_prova} type="date" /></div><label className="block space-y-2"><Label htmlFor="descricao">Descrição</Label><textarea id="descricao" name="descricao" defaultValue={contest?.descricao ?? ''} rows={4} className="w-full rounded-md border bg-background p-3 text-sm" /></label><Button type="submit"><Save />Salvar concurso</Button></CardContent></Card></form></div>
}

export function ProvaForm({ contestId, exam }: { contestId: string; exam?: Exam }) {
  return <form action={saveProvaAction}><input type="hidden" name="id" value={exam?.id ?? ''} /><input type="hidden" name="concurso_id" value={contestId} /><Card><CardHeader><CardTitle className="text-base">{exam ? `Editar prova: ${exam.nome}` : 'Adicionar prova'}</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><Field name="nome" label="Nome" value={exam?.nome} required /><Field name="cargo" label="Cargo" value={exam?.cargo} /><Field name="especialidade" label="Especialidade" value={exam?.especialidade} /><Field name="codigo_prova" label="Código" value={exam?.codigo_prova} /><Field name="turno" label="Turno" value={exam?.turno} /></div><Button type="submit" variant={exam ? 'outline' : 'default'}><Save />{exam ? 'Atualizar prova' : 'Adicionar prova'}</Button></CardContent></Card></form>
}

function Field({ name, label, value, required = false, type = 'text' }: { name: string; label: string; value?: string | number | null; required?: boolean; type?: string }) {
  return <label className="space-y-2"><Label htmlFor={`${name}-${String(value ?? 'new')}`}>{label}</Label><Input id={`${name}-${String(value ?? 'new')}`} name={name} type={type} defaultValue={value ?? ''} required={required} /></label>
}
