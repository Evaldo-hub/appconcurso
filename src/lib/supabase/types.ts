// Tabelas existentes (conforme requisitos)
export interface Concurso {
  id: string
  nome: string
  orgao: string
  ano: number
  descricao?: string
  created_at: string
}

export interface Prova {
  id: string
  concurso_id: string
  banca: string
  ano: number
  descricao?: string
  created_at: string
}

export interface QuestaoEstudo {
  id: string
  prova_id: string
  disciplina: string
  assunto: string
  subassunto?: string
  enunciado: string
  alternativa_a: string
  alternativa_b: string
  alternativa_c: string
  alternativa_d: string
  alternativa_e: string
  alternativa_correta: string
  dificuldade?: 'facil' | 'media' | 'dificil'
  explicacao?: string
  created_at: string
}

export interface QuestaoFonte {
  id: string
  questao_id: string
  arquivo_origem: string
  pagina?: number
  created_at: string
}

export interface EstudoQuestao {
  id: string
  questao_id: string
  tipo: 'explicacao' | 'resumo' | 'aula'
  conteudo: string
  created_at: string
}

export interface Simulado {
  id: number
  usuario_id: string
  concurso_id: number
  disciplina?: string
  assunto?: string
  quantidade_questoes: number
  data_criacao: string
  data_conclusao?: string
  questoes_respondidas: number
  acertos: number
  erros: number
  tempo_total?: number
}

export interface SimuladoQuestoes {
  id: number
  simulado_id: number
  questao_id: number
  ordem: number
}

export interface RespostaSimulado {
  id: number
  simulado_id: number
  questao_id: number
  alternativa_selecionada: string
  correta: boolean
  tempo_gasto?: number
}

export interface Document {
  id: string
  nome: string
  tipo: string
  url: string
  created_at: string
}

// Tabelas adicionais propostas
export interface Profile {
  id: string
  nome?: string
  email?: string
  created_at: string
  updated_at: string
}

export interface RespostaQuestao {
  id: number
  usuario_id: string
  questao_id: number
  alternativa_selecionada: string
  correta: boolean
  tempo_gasto?: number
  created_at: string
}

export interface QuestaoFavorita {
  usuario_id: string
  questao_id: string
  created_at: string
}

export interface QuestaoRevisao {
  usuario_id: string
  questao_id: string
  motivo: 'erro' | 'importante' | 'duvida'
  created_at: string
}

export interface SessaoEstudo {
  id: string
  usuario_id: string
  concurso_id?: string
  disciplina_id?: string
  assunto_id?: string
  data_inicio: string
  data_fim?: string
  questoes_respondidas: number
  tempo_total?: number
}

export interface ConfiguracaoUsuario {
  usuario_id: string
  concurso_atual?: string
  tema: 'light' | 'dark'
  notificacoes: boolean
  created_at: string
  updated_at: string
}

export interface N8nCache {
  id: string
  tipo: 'explicacao' | 'resumo' | 'aula'
  questao_id?: string
  assunto_id?: string
  parametros: Record<string, unknown>
  resposta: Record<string, unknown>
  created_at: string
  expires_at: string
}
