import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createStudyQuestionLoader } from './public-study-question'

export async function loadStudyQuestionById(id: number) {
  const supabase = await createClient()
  return createStudyQuestionLoader(async (questionId) => {
    const { data, error } = await supabase.from('questoes_estudo')
      .select('id,disciplina,assunto,subassunto,banca,dificuldade,enunciado,alternativa_a,alternativa_b,alternativa_c,alternativa_d,alternativa_e')
      .eq('id', questionId).maybeSingle()
    if (error) throw new Error('QUESTION_LOAD_FAILED')
    return data
  })(id)
}
