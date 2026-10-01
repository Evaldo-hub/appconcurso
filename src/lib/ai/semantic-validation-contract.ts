export const SEMANTIC_VALIDATION_STATUSES = [
  'aprovada_diretamente',
  'corrigida_e_aprovada',
  'rejeitada_validacao',
] as const

export type SemanticValidationStatus = typeof SEMANTIC_VALIDATION_STATUSES[number]

export const SEMANTIC_PROBLEMS = [
  'gabarito_inconsistente',
  'nenhuma_alternativa_correta',
  'multiplas_alternativas_corretas',
  'enunciado_ambiguo',
  'enunciado_insuficiente',
  'explicacao_inconsistente',
  'alternativa_duplicada',
  'erro_logico',
  'erro_matematico',
  'erro_factual',
  'outro',
] as const

export type SemanticProblem = typeof SEMANTIC_PROBLEMS[number]

export const SEMANTIC_PROBLEM_LABELS: Record<SemanticProblem, string> = {
  gabarito_inconsistente: 'Gabarito inconsistente',
  nenhuma_alternativa_correta: 'Nenhuma alternativa correta',
  multiplas_alternativas_corretas: 'Mais de uma alternativa correta',
  enunciado_ambiguo: 'Enunciado ambíguo',
  enunciado_insuficiente: 'Enunciado insuficiente',
  explicacao_inconsistente: 'Explicação inconsistente',
  alternativa_duplicada: 'Alternativa duplicada',
  erro_logico: 'Erro lógico',
  erro_matematico: 'Erro matemático',
  erro_factual: 'Erro factual',
  outro: 'Outra inconsistência',
}
