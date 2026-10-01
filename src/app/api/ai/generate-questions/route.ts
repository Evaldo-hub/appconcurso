import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateQuestions } from '@/lib/ai/generate-questions'
import { saveGeneratedQuestions } from '@/lib/ai/save-generated-questions'
import { fetchRecentQuestionStatements } from '@/lib/ai/question-diversity'
import { tryBuildHistoricalConceptMap } from '@/lib/ai/historical-concept-map'
import { validateBeforePersistence } from '@/lib/ai/validate-generated-question'

const inputSchema = z.object({
  concurso_id: z.coerce.number().int().positive(),
  prova_id: z.coerce.number().int().positive(),
  disciplina: z.string().trim().min(1).max(200),
  assunto: z.string().trim().min(1).max(300),
  banca: z.string().trim().min(1).max(200),
  dificuldade: z.enum(['Fácil', 'Média', 'Difícil']),
  quantidade: z.coerce.number().int().min(1).max(50),
})

const json = (
  body: Record<string, unknown>,
  status = 200,
) => NextResponse.json(body, { status })

export async function POST(request: NextRequest) {
  try {
    /*
     * 1. Validação da origem da requisição
     */
    const expectedOrigin = process.env.NEXT_PUBLIC_APP_URL
    const origin = request.headers.get('origin')

    if (
      expectedOrigin &&
      origin &&
      origin !== expectedOrigin
    ) {
      return json(
        { error: 'Origem não permitida.' },
        403,
      )
    }

    /*
     * 2. Usuário autenticado
     */
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return json(
        { error: 'Sessão inválida ou expirada.' },
        401,
      )
    }

    /*
     * 3. Validação dos dados recebidos
     */
    const body = await request
      .json()
      .catch(() => null)

    const parsed = inputSchema.safeParse(body)

    if (!parsed.success) {
      return json(
        { error: 'Revise os campos da geração.' },
        400,
      )
    }

    const input = parsed.data
    const admin = createAdminClient()

    /*
     * 4. Validação do acesso do usuário
     */
    const {
      data: hasAccess,
      error: accessError,
    } = await admin.rpc(
      'usuario_tem_acesso',
      {
        p_usuario_id: user.id,
      },
    )

    if (
      accessError &&
      accessError.code !== 'PGRST202'
    ) {
      return json(
        {
          error:
            'Não foi possível validar seu acesso.',
        },
        503,
      )
    }

    if (!accessError && !hasAccess) {
      return json(
        {
          error:
            'Seu período de acesso expirou.',
        },
        403,
      )
    }

    /*
     * 5. Confirma:
     *    - concurso
     *    - prova
     *    - conteúdo programático
     */
    const [
      { data: contest },
      { data: exam },
      { data: catalogEntry },
    ] = await Promise.all([
      admin
        .from('concursos')
        .select('id, banca')
        .eq('id', input.concurso_id)
        .maybeSingle(),

      admin
        .from('provas')
        .select('id')
        .eq('id', input.prova_id)
        .eq(
          'concurso_id',
          input.concurso_id,
        )
        .maybeSingle(),

      admin
        .from('conteudo_programatico')
        .select('id')
        .eq(
          'concurso_id',
          input.concurso_id,
        )
        .eq(
          'prova_id',
          input.prova_id,
        )
        .eq(
          'disciplina',
          input.disciplina,
        )
        .eq(
          'assunto',
          input.assunto,
        )
        .eq('ativo', true)
        .limit(1)
        .maybeSingle(),
    ])

    if (!contest) {
      return json(
        {
          error:
            'Concurso não encontrado.',
        },
        400,
      )
    }

    if (!exam) {
      return json(
        {
          error:
            'A prova não pertence ao concurso selecionado.',
        },
        400,
      )
    }

    if (!catalogEntry) {
      return json(
        {
          error:
            'A disciplina e o assunto não pertencem ao conteúdo programático da prova.',
        },
        400,
      )
    }

    /*
     * 6. A banca recebida precisa ser a banca
     *    cadastrada para o concurso.
     */
    if (
      !contest.banca?.trim() ||
      contest.banca.trim() !== input.banca
    ) {
      return json(
        {
          error:
            'A banca não corresponde ao concurso selecionado.',
        },
        400,
      )
    }

    /*
     * 7. Rate limit
     */
    const {
      data: allowed,
      error: limitError,
    } = await admin.rpc(
      'consumir_limite_integracao',
      {
        p_usuario_id: user.id,
        p_chave: 'gerar-questoes',
        p_limite: 10,
        p_janela_segundos: 600,
      },
    )

    if (limitError) {
      return json(
        {
          error:
            'Controle de segurança indisponível.',
        },
        503,
      )
    }

    if (!allowed) {
      return json(
        {
          error:
            'Muitas gerações solicitadas. Aguarde alguns minutos.',
        },
        429,
      )
    }

    /*
     * 8. Identificador da geração
     */
    const sessionId = crypto.randomUUID()

    /*
     * 9. Geração nativa das questões
     *
     * Fluxo:
     *
     * Next.js
     *   ↓
     * Gemini
     *   ↓ fallback
     * Groq
     *   ↓
     * Zod
     *
     * Não há n8n nesta etapa.
     */
    let enunciadosAnteriores: string[] = []

    try {
      enunciadosAnteriores = await fetchRecentQuestionStatements(admin, {
        concursoId: input.concurso_id,
        provaId: input.prova_id,
        disciplina: input.disciplina,
        assunto: input.assunto,
      })
    } catch (diversityError) {
      console.warn(
        '[AI] Contexto de diversidade indisponível; a geração continuará.',
        diversityError instanceof Error ? diversityError.message : 'Erro desconhecido',
      )
    }

    console.info('[AI] Histórico de diversidade carregado.', { quantidade: enunciadosAnteriores.length })

    const mapaConceitualHistorico = await tryBuildHistoricalConceptMap({
      disciplina: input.disciplina,
      assunto: input.assunto,
      enunciados: enunciadosAnteriores,
    })

    console.info('[AI] Mapa conceitual histórico preparado.', {
      conceitos: mapaConceitualHistorico.conceitos.length,
      utilizado: mapaConceitualHistorico.conceitos.length > 0,
    })

    const generated = await generateQuestions({
      disciplina: input.disciplina,
      assunto: input.assunto,
      banca: input.banca,
      dificuldade: input.dificuldade,
      quantidade: input.quantidade,
      enunciadosAnteriores,
      mapaConceitualHistorico,
    })

    const semantic = await validateBeforePersistence(
      generated.questoes,
      {
        disciplina: input.disciplina,
        assunto: input.assunto,
        subassunto: null,
        banca: input.banca,
        dificuldade: input.dificuldade,
      },
      (approvedQuestions) => saveGeneratedQuestions({
        admin,
        concursoId: input.concurso_id,
        provaId: input.prova_id,
        disciplina: input.disciplina,
        assunto: input.assunto,
        banca: input.banca,
        dificuldade: input.dificuldade,
        questoes: approvedQuestions,
      }),
    )

    /*
     * 10. Cadastro no Supabase
     *
     * O módulo:
     * - calcula SHA-256;
     * - verifica duplicidade;
     * - grava questoes_estudo;
     * - trata unique violation;
     * - retorna os IDs cadastrados.
     */
    const saveResult = semantic.persistencia ?? {
      total_analisadas: 0,
      cadastradas: 0,
      duplicadas: 0,
      erros: 0,
      questao_ids: [],
      resultados: [],
    }

    /*
     * 11. Resposta para o frontend
     */
    return json({
      sucesso: saveResult.erros === 0 && semantic.validacao.rejeitadas === 0,

      total_analisadas:
        saveResult.total_analisadas,

      cadastradas:
        saveResult.cadastradas,

      duplicadas:
        saveResult.duplicadas,

      erros:
        saveResult.erros,

      resposta:
        `${saveResult.cadastradas} questão(ões) cadastrada(s), ` +
        `${saveResult.duplicadas} duplicada(s) e ` +
        `${saveResult.erros} erro(s).`,

      session_id: sessionId,

      usuario_id: user.id,

      /*
       * Informa qual provedor efetivamente
       * respondeu: gemini ou groq.
       */
      origem: generated.provider,

      gravado_no_banco:
        saveResult.cadastradas > 0,

      questao_ids:
        saveResult.questao_ids,

      /*
       * Mantemos as questões na resposta para
       * compatibilidade com a interface.
       */
      questoes:
        semantic.questoes,

      validacao: semantic.validacao,

      rejeicoes_validacao: semantic.rejeicoes,

      resultados: semantic.resultados,

      filtros: input,
    })
  } catch (error) {
    console.error(
      '[AI] Erro na geração de questões:',
      error,
    )

    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Não foi possível processar a geração.',
      },
      500,
    )
  }
}
