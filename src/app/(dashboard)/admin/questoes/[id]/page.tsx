import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Save } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateQuestionAction } from '../actions'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export const dynamic = 'force-dynamic'

export default async function AdminQuestionEditPage({ params, searchParams }: PageProps<'/admin/questoes/[id]'>) {
  const { id } = await params
  const query = await searchParams
  if (!/^\d+$/.test(id)) notFound()
  const admin = createAdminClient()
  const { data: question } = await admin.from('questoes_estudo').select('id, disciplina, assunto, subassunto, banca, dificuldade, enunciado, alternativa_a, alternativa_b, alternativa_c, alternativa_d, alternativa_e, gabarito, explicacao').eq('id', id).maybeSingle()
  if (!question) notFound()

  const alternatives = ['a', 'b', 'c', 'd', 'e'] as const
  return (
    <div className="space-y-6">
      <Link href="/admin/questoes" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Voltar às questões</Link>
      <div><h1 className="text-2xl font-bold">Editar questão #{question.id}</h1><p className="text-sm text-muted-foreground">As alterações ficam registradas na auditoria administrativa.</p></div>
      {query.salvo === '1' && <Alert>Questão atualizada com sucesso.</Alert>}
      {query.erro === 'campos' && <Alert variant="destructive">Revise os campos obrigatórios e o tamanho dos textos.</Alert>}
      {query.erro === 'migration' && <Alert variant="destructive">Não foi possível salvar. Confirme que a migration da Fase 17 foi aplicada.</Alert>}

      <form action={updateQuestionAction}>
        <input type="hidden" name="id" value={question.id} />
        <Card><CardHeader><CardTitle>Conteúdo</CardTitle></CardHeader><CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Disciplina" name="disciplina" value={question.disciplina} required />
            <Field label="Assunto" name="assunto" value={question.assunto} required />
            <Field label="Subassunto" name="subassunto" value={question.subassunto} />
            <Field label="Banca" name="banca" value={question.banca} />
            <Field label="Dificuldade" name="dificuldade" value={question.dificuldade} />
            <label className="space-y-2"><Label htmlFor="gabarito">Gabarito</Label><select id="gabarito" name="gabarito" defaultValue={question.gabarito} required className="h-10 w-full rounded-md border bg-background px-3">{['A','B','C','D','E'].map((letter) => <option key={letter}>{letter}</option>)}</select></label>
          </div>
          <TextArea label="Enunciado" name="enunciado" value={question.enunciado} required rows={7} />
          <div className="space-y-4">{alternatives.map((letter) => <TextArea key={letter} label={`Alternativa ${letter.toUpperCase()}`} name={`alternativa_${letter}`} value={question[`alternativa_${letter}`]} rows={3} />)}</div>
          <TextArea label="Explicação" name="explicacao" value={question.explicacao} rows={7} />
          <Button type="submit"><Save />Salvar alterações</Button>
        </CardContent></Card>
      </form>
    </div>
  )
}

function Field({ label, name, value, required = false }: { label: string; name: string; value: string | null; required?: boolean }) {
  return <label className="space-y-2"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} defaultValue={value ?? ''} required={required} /></label>
}

function TextArea({ label, name, value, required = false, rows }: { label: string; name: string; value: string | null; required?: boolean; rows: number }) {
  return <label className="block space-y-2"><Label htmlFor={name}>{label}</Label><textarea id={name} name={name} defaultValue={value ?? ''} required={required} rows={rows} className="w-full rounded-md border bg-background px-3 py-2 text-sm" /></label>
}
