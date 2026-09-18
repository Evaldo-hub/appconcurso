'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Bot, CheckCircle2, Loader2 } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface Contest { id: number; nome: string; ano: number | null }
interface Exam { id: number; concurso_id: number; nome: string }
interface Metadata { disciplina: string | null; assunto: string | null; banca: string | null }
interface Result { total_analisadas: number; cadastradas: number; duplicadas: number; erros: number; resposta: string; questao_ids: number[]; filtros: { concurso_id: number; prova_id: number; disciplina: string; assunto: string; banca: string } }

export function GenerateQuestionsForm({ contests, exams, metadata, catalogError }: { contests: Contest[]; exams: Exam[]; metadata: Metadata[]; catalogError: string | null }) {
  const [contestId, setContestId] = useState('')
  const [examId, setExamId] = useState('')
  const [discipline, setDiscipline] = useState('')
  const [subject, setSubject] = useState('')
  const [board, setBoard] = useState('')
  const [difficulty, setDifficulty] = useState<'Fácil' | 'Média' | 'Difícil'>('Média')
  const [amount, setAmount] = useState(5)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const visibleExams = exams.filter((exam) => String(exam.concurso_id) === contestId)
  const disciplines = unique(metadata.map((item) => item.disciplina))
  const subjects = unique(metadata.filter((item) => item.disciplina === discipline).map((item) => item.assunto))
  const boards = unique(metadata.filter((item) => (!discipline || item.disciplina === discipline) && (!subject || item.assunto === subject)).map((item) => item.banca))
  const command = useMemo(() => discipline && subject && board ? `Gere ${amount} questões de ${discipline} sobre ${subject}, nível ${difficulty}, no estilo ${board}.` : '', [amount, board, difficulty, discipline, subject])

  const generate = async () => {
    setLoading(true); setError(null); setResult(null)
    try {
      const response = await fetch('/api/ai/generate-questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ concurso_id: Number(contestId), prova_id: Number(examId), disciplina: discipline, assunto: subject, banca: board, dificuldade: difficulty, quantidade: amount }) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Não foi possível gerar as questões.')
      setResult(data as Result)
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Não foi possível gerar as questões.') }
    finally { setLoading(false) }
  }
  const viewUrl = result ? `/questoes?${new URLSearchParams({ concurso: String(result.filtros.concurso_id), prova: String(result.filtros.prova_id), disciplina: result.filtros.disciplina, assunto: result.filtros.assunto, banca: result.filtros.banca, ...(result.questao_ids.length ? { ids: result.questao_ids.join(',') } : {}) })}` : '/questoes'

  return <div className="mx-auto max-w-4xl space-y-6"><div><h1 className="flex items-center gap-2 text-2xl font-bold md:text-3xl"><Bot className="h-8 w-8 text-primary" />Gerar Questões com IA</h1><p className="text-muted-foreground">Configure a solicitação. O cadastro será realizado exclusivamente pelo workflow do n8n.</p></div>{catalogError && <Alert variant="destructive">{catalogError}</Alert>}
    <Card><CardHeader><CardTitle>Configuração</CardTitle></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 md:grid-cols-2">
      <Select label="Concurso" value={contestId} onChange={(value) => { setContestId(value); setExamId('') }} options={contests.map((item) => ({ value: String(item.id), label: `${item.nome}${item.ano ? ` — ${item.ano}` : ''}` }))} placeholder="Selecione" />
      <Select label="Prova" value={examId} onChange={setExamId} options={visibleExams.map((item) => ({ value: String(item.id), label: item.nome }))} placeholder="Selecione" disabled={!contestId} />
      <Select label="Disciplina" value={discipline} onChange={(value) => { setDiscipline(value); setSubject(''); setBoard('') }} options={disciplines.map(toOption)} placeholder="Selecione" />
      <Select label="Assunto" value={subject} onChange={(value) => { setSubject(value); setBoard('') }} options={subjects.map(toOption)} placeholder="Selecione" disabled={!discipline} />
      <Select label="Banca" value={board} onChange={setBoard} options={boards.map(toOption)} placeholder="Selecione" disabled={!subject} />
      <Select label="Dificuldade" value={difficulty} onChange={(value) => setDifficulty(value as typeof difficulty)} options={['Fácil','Média','Difícil'].map(toOption)} placeholder="Selecione" />
      <label className="space-y-2 text-sm font-medium"><span>Quantidade</span><Input type="number" min={1} max={50} value={amount} onChange={(event) => setAmount(Math.min(50, Math.max(1, Number(event.target.value) || 1)))} /></label>
    </div>{command && <div className="rounded-md bg-muted p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Comando gerado</p><p className="mt-1 text-sm">{command}</p></div>}<Button onClick={() => void generate()} disabled={loading || Boolean(catalogError) || !contestId || !examId || !discipline || !subject || !board}>{loading ? <Loader2 className="animate-spin" /> : <Bot />}{loading ? 'Gerando questões com IA...' : 'Gerar Questões com IA'}</Button></CardContent></Card>
    {error && <Alert variant="destructive">{error}</Alert>}{result && <Card className="border-green-600"><CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="text-green-600" />Geração concluída</CardTitle></CardHeader><CardContent className="space-y-5"><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Metric label="Analisadas" value={result.total_analisadas} /><Metric label="Cadastradas" value={result.cadastradas} /><Metric label="Duplicadas" value={result.duplicadas} /><Metric label="Erros" value={result.erros} /></div>{result.resposta && <p className="text-sm text-muted-foreground">{result.resposta}</p>}<Button asChild><Link href={viewUrl}>Ver questões geradas</Link></Button></CardContent></Card>}
  </div>
}

function Select({ label, value, onChange, options, placeholder, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; placeholder: string; disabled?: boolean }) { return <label className="space-y-2 text-sm font-medium"><span>{label}</span><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 disabled:opacity-50"><option value="">{placeholder}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> }
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-md border p-3 text-center"><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div> }
const toOption = (value: string) => ({ value, label: value })
function unique(values: Array<string | null>) { return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, 'pt-BR')) }
