import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckCircle2, Clock3, ListChecks, Target, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatStudyTime } from '@/lib/study/study-performance'
import { loadStudyPerformance } from '@/lib/study/study-performance-loader'

const percent = (value: number) => `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
const dateTime = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value))

export default async function DesempenhoPage() {
  const result = await loadStudyPerformance(20)
  if (!result.authenticated) redirect('/login?redirectTo=/desempenho')
  const { summary, disciplines, subjects, history } = result.data
  if (summary.totalRespondidas === 0) return <div className="mx-auto max-w-4xl space-y-6"><Header /><Card><CardContent className="space-y-4 py-16 text-center"><ListChecks className="mx-auto h-10 w-10 text-muted-foreground" /><h2 className="text-lg font-semibold">Você ainda não respondeu questões.</h2><p className="text-sm text-muted-foreground">Resolva questões para começar a acompanhar seu desempenho.</p><Button asChild><Link href="/questoes/gerar">Gerar questões</Link></Button></CardContent></Card></div>

  return <div className="space-y-6 fade-in"><Header />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Resumo do desempenho">
      <Metric title="Questões respondidas" value={summary.totalRespondidas} icon={ListChecks} />
      <Metric title="Acertos" value={summary.totalCorretas} icon={CheckCircle2} />
      <Metric title="Erros" value={summary.totalIncorretas} icon={XCircle} />
      <Metric title="Taxa de acerto" value={percent(summary.taxaAcerto)} icon={Target} />
      <Metric title="Tempo médio" value={formatStudyTime(summary.tempoMedio)} icon={Clock3} />
    </section>
    <PerformanceTable title="Desempenho por disciplina" rows={disciplines.map((item) => ({ key: item.disciplina, label: item.disciplina, ...item }))} />
    <PerformanceTable title="Desempenho por assunto" rows={subjects.map((item) => ({ key: `${item.disciplina}-${item.assunto}`, label: `${item.disciplina} — ${item.assunto}`, ...item }))} />
    <Card><CardHeader><CardTitle>Histórico recente</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="pb-3 pr-4">Data</th><th className="pb-3 pr-4">Disciplina / assunto</th><th className="pb-3 pr-4">Resposta</th><th className="pb-3 pr-4">Resultado</th><th className="pb-3 pr-4">Tempo</th><th className="pb-3">Questão</th></tr></thead><tbody>{history.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="py-3 pr-4 whitespace-nowrap">{dateTime(item.createdAt)}</td><td className="py-3 pr-4"><span className="block font-medium">{item.disciplina}</span><span className="text-muted-foreground">{item.assunto}</span></td><td className="py-3 pr-4 font-semibold">{item.alternativaSelecionada}</td><td className={`py-3 pr-4 font-medium ${item.correta ? 'text-green-700' : 'text-destructive'}`}>{item.correta ? 'Correta' : 'Incorreta'}</td><td className="py-3 pr-4 whitespace-nowrap">{formatStudyTime(item.tempoGasto)}</td><td className="py-3"><Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/questoes/${item.questaoId}`}>Abrir #{item.questaoId}</Link></td></tr>)}</tbody></table></CardContent></Card>
  </div>
}

function Header() { return <div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Meu desempenho</h1><p className="text-muted-foreground">Histórico baseado nas suas respostas persistidas.</p></div> }

function Metric({ title, value, icon: Icon }: { title: string; value: string | number; icon: typeof ListChecks }) { return <Card><CardContent className="flex items-center gap-3 p-5"><div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></div><div><p className="text-sm text-muted-foreground">{title}</p><p className="text-2xl font-bold">{value}</p></div></CardContent></Card> }

function PerformanceTable({ title, rows }: { title: string; rows: Array<{ key: string; label: string; respondidas: number; corretas: number; incorretas: number; taxaAcerto: number }> }) { return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="pb-3 pr-4">Grupo</th><th className="pb-3 pr-4 text-right">Respondidas</th><th className="pb-3 pr-4 text-right">Corretas</th><th className="pb-3 pr-4 text-right">Incorretas</th><th className="pb-3 text-right">Taxa</th></tr></thead><tbody>{rows.map((item) => <tr key={item.key} className="border-b last:border-0"><td className="py-3 pr-4 font-medium">{item.label}</td><td className="py-3 pr-4 text-right">{item.respondidas}</td><td className="py-3 pr-4 text-right">{item.corretas}</td><td className="py-3 pr-4 text-right">{item.incorretas}</td><td className="py-3 text-right font-semibold">{percent(item.taxaAcerto)}</td></tr>)}</tbody></table></CardContent></Card> }
