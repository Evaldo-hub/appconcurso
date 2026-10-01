export interface SemanticValidationMetrics {
  analisadas: number
  aprovadas_primeira_validacao: number
  enviadas_correcao: number
  corrigidas_e_aprovadas: number
  rejeitadas_validacao: number
}

export interface IndividualQuestionResult {
  numero_questao: number
  questao_id: number | null
  status?: 'cadastrada' | 'duplicada' | 'erro'
  status_validacao?: SemanticValidationStatus
  problemas?: SemanticProblem[]
  problemas_correcao?: SemanticProblem[]
}

export function SemanticValidationSummary({
  validation,
}: {
  validation?: SemanticValidationMetrics | null
}) {
  if (!validation) return null

  return (
    <section aria-labelledby="semantic-validation-title" className="space-y-3 border-t pt-5">
      <div>
        <h3 id="semantic-validation-title" className="font-semibold">
          Validação semântica
        </h3>
        <p className="text-xs text-muted-foreground">
          {validation.analisadas} questão(ões) analisada(s) pelo validador.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Aprovadas diretamente" value={validation.aprovadas_primeira_validacao} />
        <Metric label="Corrigidas e aprovadas" value={validation.corrigidas_e_aprovadas} />
        <Metric label="Rejeitadas" value={validation.rejeitadas_validacao} />
      </div>

      {validation.enviadas_correcao > 0 && (
        <p className="text-sm text-muted-foreground">
          {validation.enviadas_correcao} questão(ões) precisou(aram) de correção automática.
        </p>
      )}

      {validation.rejeitadas_validacao > 0 && (
        <p role="status" className="text-sm font-medium text-amber-700 dark:text-amber-400">
          {validation.rejeitadas_validacao} questão(ões) foi(ram) bloqueada(s) pela validação e não foi(ram) cadastrada(s).
        </p>
      )}
    </section>
  )
}

export function IndividualValidationResults({
  results,
}: {
  results?: IndividualQuestionResult[] | null
}) {
  if (!results?.length) return null

  return (
    <section aria-labelledby="individual-validation-title" className="space-y-3 border-t pt-5">
      <h3 id="individual-validation-title" className="font-semibold">Resultado por questão</h3>
      <div className="space-y-2">
        {results.map((result) => {
          const problems = result.status_validacao === 'corrigida_e_aprovada'
            ? result.problemas_correcao
            : result.problemas
          return (
            <div key={result.numero_questao} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {result.questao_id ? (
                    <Link className="underline-offset-4 hover:underline" href={`/questoes/${result.questao_id}`}>
                      Questão {result.numero_questao}
                    </Link>
                  ) : `Questão ${result.numero_questao}`}
                </p>
                <ValidationBadge status={result.status_validacao} />
              </div>
              {problems && problems.length > 0 && (
                <div className="mt-2 text-xs text-muted-foreground">
                  <p>{result.status_validacao === 'corrigida_e_aprovada' ? 'Motivo da correção:' : 'Problemas identificados:'}</p>
                  <ul className="mt-1 list-disc pl-5">
                    {problems.map((problem) => <li key={problem}>{SEMANTIC_PROBLEM_LABELS[problem]}</li>)}
                  </ul>
                </div>
              )}
              {result.status && <p className="mt-2 text-xs text-muted-foreground">Persistência: {persistenceLabel(result.status)}</p>}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ValidationBadge({ status }: { status?: SemanticValidationStatus }) {
  const presentation = {
    aprovada_diretamente: { symbol: '✓', label: 'Aprovada diretamente', className: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200' },
    corrigida_e_aprovada: { symbol: '✓', label: 'Corrigida e aprovada', className: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200' },
    rejeitada_validacao: { symbol: '✕', label: 'Rejeitada pelo validador', className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' },
  } as const

  if (!status) return <span className="rounded-full bg-muted px-2 py-1 text-xs">Status de validação não informado</span>
  const item = presentation[status]
  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${item.className}`}>{item.symbol} {item.label}</span>
}

function persistenceLabel(status: NonNullable<IndividualQuestionResult['status']>): string {
  return { cadastrada: 'Cadastrada', duplicada: 'Duplicada', erro: 'Erro' }[status]
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3 text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
import Link from 'next/link'
import {
  SEMANTIC_PROBLEM_LABELS,
  type SemanticProblem,
  type SemanticValidationStatus,
} from '@/lib/ai/semantic-validation-contract'
