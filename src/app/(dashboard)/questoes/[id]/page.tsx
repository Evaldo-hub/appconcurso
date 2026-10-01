import { notFound } from 'next/navigation'
import { ExistingStudyQuestion } from '@/components/estudar/existing-study-question'
import { parseStudyQuestionId } from '@/lib/study/public-study-question'
import { loadStudyQuestionById } from '@/lib/study/study-question-loader'

export default async function ExistingQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params
  const id = parseStudyQuestionId(rawId)
  if (id === null) notFound()
  const question = await loadStudyQuestionById(id)
  if (!question) notFound()
  return <div className="mx-auto max-w-4xl space-y-6"><div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Resolver questão</h1><p className="text-muted-foreground">Questão {question.id}</p></div><ExistingStudyQuestion question={question} /></div>
}
