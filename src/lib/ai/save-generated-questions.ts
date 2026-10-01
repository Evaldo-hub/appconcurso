import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { GeneratedQuestion } from './question-schema'

interface SaveGeneratedQuestionsInput {
  admin: SupabaseClient
  concursoId: number
  provaId: number
  disciplina: string
  assunto: string
  banca: string
  dificuldade: 'Fácil' | 'Média' | 'Difícil'
  questoes: GeneratedQuestion[]
}

export interface SaveGeneratedQuestionsResult {
  total_analisadas: number
  cadastradas: number
  duplicadas: number
  erros: number
  questao_ids: number[]
  resultados: Array<{
    numero_questao: number
    questao_id: number | null
    status: 'cadastrada' | 'duplicada' | 'erro'
  }>
}

function normalizeForHash(value: string): string {
  return value
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
}

function createQuestionHash(input: {
  concursoId: number
  provaId: number
  disciplina: string
  assunto: string
  enunciado: string
}): string {
  const canonical = [
    String(input.concursoId),
    String(input.provaId),
    normalizeForHash(input.disciplina).toLowerCase(),
    normalizeForHash(input.assunto).toLowerCase(),
    normalizeForHash(input.enunciado).toLowerCase(),
  ].join('|')

  return createHash('sha256')
    .update(canonical, 'utf8')
    .digest('hex')
}

function isDuplicateError(error: {
  code?: string
  message?: string
} | null): boolean {
  if (!error) return false

  // PostgreSQL unique_violation
  return error.code === '23505'
}

export async function saveGeneratedQuestions(
  input: SaveGeneratedQuestionsInput,
): Promise<SaveGeneratedQuestionsResult> {
  const result: SaveGeneratedQuestionsResult = {
    total_analisadas: input.questoes.length,
    cadastradas: 0,
    duplicadas: 0,
    erros: 0,
    questao_ids: [],
    resultados: [],
  }

  for (let index = 0; index < input.questoes.length; index += 1) {
    const questao = input.questoes[index]
    const numeroQuestao = index + 1
    const hashQuestao = createQuestionHash({
      concursoId: input.concursoId,
      provaId: input.provaId,
      disciplina: input.disciplina,
      assunto: input.assunto,
      enunciado: questao.enunciado,
    })

    /*
     * Verificação antecipada.
     *
     * Os índices UNIQUE do PostgreSQL continuam sendo
     * a proteção definitiva contra concorrência.
     */
    const { data: existing, error: lookupError } = await input.admin
      .from('questoes_estudo')
      .select('id')
      .or(
        `hash_questao.eq.${hashQuestao},and(prova_id.eq.${input.provaId},enunciado.eq.${JSON.stringify(questao.enunciado)})`,
      )
      .limit(1)
      .maybeSingle()

    if (lookupError) {
      console.error(
        '[AI] Erro ao verificar duplicidade:',
        lookupError,
      )

      result.erros += 1
      result.resultados.push({ numero_questao: numeroQuestao, questao_id: null, status: 'erro' })
      continue
    }

    if (existing) {
      const existingId = Number(existing.id)
      result.duplicadas += 1
      result.resultados.push({
        numero_questao: numeroQuestao,
        questao_id: Number.isSafeInteger(existingId) ? existingId : null,
        status: 'duplicada',
      })
      continue
    }

    const { data: inserted, error: insertError } =
      await input.admin
        .from('questoes_estudo')
        .insert({
          concurso_id: input.concursoId,
          prova_id: input.provaId,

          disciplina: input.disciplina,
          assunto: input.assunto,
          subassunto: null,

          banca: input.banca,
          dificuldade: input.dificuldade,

          enunciado: questao.enunciado,

          alternativa_a: questao.alternativa_a,
          alternativa_b: questao.alternativa_b,
          alternativa_c: questao.alternativa_c,
          alternativa_d: questao.alternativa_d,
          alternativa_e: questao.alternativa_e,

          gabarito: questao.gabarito,
          explicacao: questao.explicacao,

          numero_questao: null,
          resposta_id: null,
          arquivo_origem: null,

          tipo_origem: 'ia_gerada',
          hash_questao: hashQuestao,
        })
        .select('id')
        .single()

    if (insertError) {
      /*
       * Mesmo que duas requisições passem simultaneamente
       * pela consulta anterior, os índices UNIQUE impedem
       * a duplicação.
       */
      if (isDuplicateError(insertError)) {
        result.duplicadas += 1
        result.resultados.push({ numero_questao: numeroQuestao, questao_id: null, status: 'duplicada' })
        continue
      }

      console.error(
        '[AI] Erro ao cadastrar questão:',
        insertError,
      )

      result.erros += 1
      result.resultados.push({ numero_questao: numeroQuestao, questao_id: null, status: 'erro' })
      continue
    }

    const questionId = Number(inserted.id)

    if (!Number.isSafeInteger(questionId)) {
      console.error(
        '[AI] ID inválido retornado após cadastro:',
        inserted.id,
      )

      result.erros += 1
      result.resultados.push({ numero_questao: numeroQuestao, questao_id: null, status: 'erro' })
      continue
    }

    result.questao_ids.push(questionId)
    result.cadastradas += 1
    result.resultados.push({ numero_questao: numeroQuestao, questao_id: questionId, status: 'cadastrada' })
  }

  return result
}
