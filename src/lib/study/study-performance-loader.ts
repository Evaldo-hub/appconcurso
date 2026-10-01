import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createStudyPerformanceLoader, type StudyPerformanceRow } from './study-performance'

interface QuestionRelation { disciplina: string | null; assunto: string | null }
interface AnswerRow { id: number; usuario_id: string; questao_id: number; alternativa_selecionada: string; correta: boolean; tempo_gasto: number | null; created_at: string; questoes_estudo: QuestionRelation | QuestionRelation[] | null }
const first = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value

export async function loadStudyPerformance(historyLimit = 20) {
  const supabase = await createClient()
  return createStudyPerformanceLoader({
    async authenticate() { const { data: { user } } = await supabase.auth.getUser(); return user?.id ?? null },
    async loadRows(userId) {
      const { data, error } = await supabase.from('respostas_questoes')
        .select('id,usuario_id,questao_id,alternativa_selecionada,correta,tempo_gasto,created_at,questoes_estudo(disciplina,assunto)')
        .eq('usuario_id', userId).order('created_at', { ascending: false }).order('id', { ascending: false })
      if (error) throw new Error('PERFORMANCE_LOAD_FAILED')
      return ((data ?? []) as unknown as AnswerRow[]).map<StudyPerformanceRow>((row) => {
        const question = first(row.questoes_estudo)
        return { id: Number(row.id), usuarioId: row.usuario_id, questaoId: Number(row.questao_id), alternativaSelecionada: row.alternativa_selecionada, correta: row.correta, tempoGasto: row.tempo_gasto, createdAt: row.created_at, disciplina: question?.disciplina ?? 'Sem disciplina', assunto: question?.assunto ?? 'Sem assunto' }
      })
    },
  })(historyLimit)
}
