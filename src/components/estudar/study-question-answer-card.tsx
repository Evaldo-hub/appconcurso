'use client'

import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AnswerLetter } from '@/lib/study/submit-study-answer'
import type { StudyAnswerState } from '@/lib/study/study-answer-state'
import type { PublicStudyQuestion } from '@/lib/study/public-study-question'

export function StudyQuestionAnswerCard({ question, state, onSelect, onAnswer, duplicate = false }: { question: PublicStudyQuestion; state: StudyAnswerState; onSelect: (answer: AnswerLetter) => void; onAnswer: () => void; duplicate?: boolean }) {
  const result = state.confirmed
  return <Card><CardHeader><CardTitle>Questão</CardTitle><p className="text-sm text-muted-foreground">{question.disciplina} · {question.assunto} · {question.banca} · dificuldade {question.dificuldade}</p></CardHeader><CardContent className="space-y-5">
    {duplicate && <Alert>Esta questão já existe no banco.</Alert>}
    <p className="font-medium">{question.enunciado}</p>
    <fieldset className="space-y-3" disabled={state.pending || Boolean(result)}><legend className="sr-only">Alternativas</legend>{(Object.entries(question.alternativas) as Array<[AnswerLetter, string]>).map(([letter, text]) => <label key={letter} className="flex cursor-pointer items-start gap-3 rounded-md border p-3"><input type="radio" name={`question-${question.id}`} value={letter} checked={state.selected === letter} onChange={() => onSelect(letter)} className="mt-1" /><span><strong>{letter}.</strong> {text}</span></label>)}</fieldset>
    {state.error && <Alert variant="destructive">{state.error}</Alert>}
    {!result && <Button type="button" onClick={onAnswer} disabled={!state.selected || state.pending}>{state.pending && <Loader2 className="h-4 w-4 animate-spin" />}{state.pending ? 'Registrando resposta...' : 'Responder'}</Button>}
    {result && <div className="space-y-4 rounded-md border p-4">{result.correct ? <p className="flex items-center gap-2 font-semibold text-green-700"><CheckCircle2 className="h-5 w-5" />Resposta correta</p> : <p className="flex items-center gap-2 font-semibold text-destructive"><XCircle className="h-5 w-5" />Resposta incorreta</p>}<p><strong>Gabarito:</strong> {result.correctAnswer}</p><div><h3 className="font-semibold">Explicação</h3><p className="text-sm text-muted-foreground">{result.explanation}</p></div><div><h3 className="font-semibold">Fontes</h3><ul className="list-disc pl-5 text-sm text-muted-foreground">{result.sources.map((source, index) => <li key={`${source.titulo}-${source.pagina}-${index}`}>{source.titulo}{source.pagina ? ` — página ${source.pagina}` : ''}</li>)}</ul></div></div>}
  </CardContent></Card>
}
