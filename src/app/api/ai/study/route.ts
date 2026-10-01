import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import {
  generateStudyContent,
  type StudyAction,
} from '@/lib/ai/study-question'

const allowedActions = [
  'explicacao',
  'resumo',
  'aula',
  'pergunta',
] as const

type Action = typeof allowedActions[number]

const json = (
  body: Record<string, unknown>,
  status = 200,
) => NextResponse.json(body, { status })

interface AuthorizedStudy {
  conteudos?: Record<string, string | null>
}

interface QuestionRow {
  id: number
  disciplina: string | null
  assunto: string | null
  subassunto: string | null
  banca: string | null
  enunciado: string
  alternativa_a: string
  alternativa_b: string
  alternativa_c: string
  alternativa_d: string
  alternativa_e: string
  gabarito: string
  explicacao: string | null
}

export async function POST(
  request: NextRequest,
) {
  try {
    /*
     * 1. Validação da origem
     */
    const expectedOrigin =
      process.env.NEXT_PUBLIC_APP_URL

    const origin =
      request.headers.get('origin')

    if (
      expectedOrigin &&
      origin &&
      origin !== expectedOrigin
    ) {
      return json(
        {
          error:
            'Origem não permitida.',
        },
        403,
      )
    }

    /*
     * 2. Configuração do Supabase
     *
     * O n8n não é mais necessário.
     */
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL

    const serviceKey =
      process.env.SUPABASE_SECRET_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      return json(
        {
          error:
            'Configuração do Supabase indisponível.',
        },
        503,
      )
    }

    /*
     * 3. Usuário autenticado
     */
    const supabase =
      await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return json(
        {
          error:
            'Sessão inválida ou expirada.',
        },
        401,
      )
    }

    /*
     * Cliente administrativo apenas no servidor.
     */
    const admin =
      createAdminClient(
        supabaseUrl,
        serviceKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        },
      )

    /*
     * 4. Validação do período de acesso
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

    if (
      !accessError &&
      !hasAccess
    ) {
      return json(
        {
          error:
            'Seu período de acesso expirou.',
        },
        403,
      )
    }

    /*
     * 5. Entrada da requisição
     */
    const input =
      await request
        .json()
        .catch(() => null) as {
          questao_id?: unknown
          acao?: unknown
          session_id?: unknown
          pergunta?: unknown
        } | null

    const questionId =
      Number(input?.questao_id)

    const action =
      input?.acao as Action

    const sessionId =
      typeof input?.session_id === 'string'
        ? input.session_id
        : ''

    const studentQuestion =
      typeof input?.pergunta === 'string'
        ? input.pergunta.trim()
        : ''

    /*
     * 6. Validação da solicitação
     */
    if (
      !Number.isSafeInteger(questionId) ||
      questionId < 1 ||
      !allowedActions.includes(action)
    ) {
      return json(
        {
          error:
            'Solicitação inválida.',
        },
        400,
      )
    }

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(sessionId)
    ) {
      return json(
        {
          error:
            'Sessão de estudo inválida. Atualize a página e tente novamente.',
        },
        400,
      )
    }

    if (
      action === 'pergunta' &&
      (
        studentQuestion.length < 1 ||
        studentQuestion.length > 2000
      )
    ) {
      return json(
        {
          error:
            'A pergunta deve ter entre 1 e 2000 caracteres.',
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
        p_chave: 'estudo-ia',
        p_limite: 20,
        p_janela_segundos: 300,
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
            'Muitas solicitações. Aguarde alguns minutos.',
        },
        429,
      )
    }

    /*
     * 8. Autoriza o estudo da questão.
     *
     * Mantemos a mesma RPC segura utilizada
     * anteriormente.
     */
    const {
      data: authorizedStudy,
      error: studyError,
    } = await supabase.rpc(
      'obter_estudo_questao_seguro',
      {
        p_questao_id: questionId,
      },
    )

    if (
      studyError ||
      !authorizedStudy
    ) {
      return json(
        {
          error:
            studyError?.message ||
            'Responda à questão antes de estudá-la.',
        },
        studyError?.code === '42501'
          ? 403
          : 400,
      )
    }

    const study =
      authorizedStudy as AuthorizedStudy

    /*
     * 9. Cache
     *
     * Explicação, resumo e aula podem ser
     * reutilizados.
     *
     * Perguntas do aluno não usam esse cache.
     */
    if (
      action !== 'pergunta' &&
      study.conteudos?.[action]
    ) {
      return json({
        conteudo:
          study.conteudos[action],

        cached: true,

        origem: 'cache',
      })
    }

    /*
     * 10. Carrega a questão diretamente
     *     do banco.
     */
    const {
      data: questionRow,
      error: questionError,
    } = await admin
      .from('questoes_estudo')
      .select(`
        id,
        disciplina,
        assunto,
        subassunto,
        banca,
        enunciado,
        alternativa_a,
        alternativa_b,
        alternativa_c,
        alternativa_d,
        alternativa_e,
        gabarito,
        explicacao
      `)
      .eq('id', questionId)
      .maybeSingle()

    if (
      questionError ||
      !questionRow
    ) {
      console.error(
        '[AI Study] Erro ao carregar questão:',
        questionError,
      )

      return json(
        {
          error:
            'Não foi possível carregar os dados da questão.',
        },
        500,
      )
    }

    const questao =
      questionRow as QuestionRow

    /*
     * 11. Geração nativa
     *
     * Next.js
     *   ↓
     * Gemini
     *   ↓ fallback
     * Groq
     *
     * Não há chamada ao n8n.
     */
    const generated =
      await generateStudyContent({
        action:
          action as StudyAction,

        questao: {
          disciplina:
            questao.disciplina,

          assunto:
            questao.assunto,

          subassunto:
            questao.subassunto,

          banca:
            questao.banca,

          enunciado:
            questao.enunciado,

          alternativa_a:
            questao.alternativa_a,

          alternativa_b:
            questao.alternativa_b,

          alternativa_c:
            questao.alternativa_c,

          alternativa_d:
            questao.alternativa_d,

          alternativa_e:
            questao.alternativa_e,

          gabarito:
            questao.gabarito,

          explicacao:
            questao.explicacao,
        },

        pergunta:
          action === 'pergunta'
            ? studentQuestion
            : undefined,
      })

    const content =
      generated.conteudo

    /*
     * 12. Salva o conteúdo gerado.
     */
    if (action === 'pergunta') {
      const {
        error: saveError,
      } = await admin
        .from('conversas_estudo_ia')
        .insert({
          usuario_id: user.id,
          questao_id: questionId,
          pergunta: studentQuestion,
          resposta: content,
          fontes: [],
        })

      if (saveError) {
        console.error(
          '[AI Study] Erro ao salvar conversa:',
          saveError,
        )

        return json(
          {
            error:
              'A resposta foi gerada, mas não pôde ser salva.',
          },
          500,
        )
      }
    } else {
      const {
        error: saveError,
      } = await admin
        .from('estudo_questao')
        .insert({
          questao_id: questionId,
          tipo: action,
          conteudo: content,
        })

      /*
       * Se duas solicitações iguais chegarem
       * simultaneamente e houver proteção UNIQUE,
       * podemos reutilizar o conteúdo já salvo.
       */
      if (
        saveError &&
        saveError.code === '23505'
      ) {
        const {
          data: existing,
        } = await admin
          .from('estudo_questao')
          .select('conteudo')
          .eq(
            'questao_id',
            questionId,
          )
          .eq(
            'tipo',
            action,
          )
          .maybeSingle()

        if (
          existing?.conteudo &&
          typeof existing.conteudo ===
            'string'
        ) {
          return json({
            conteudo:
              existing.conteudo,

            cached: true,

            origem: 'cache',
          })
        }
      }

      if (saveError) {
        console.error(
          '[AI Study] Erro ao salvar conteúdo:',
          saveError,
        )

        return json(
          {
            error:
              'A resposta foi gerada, mas não pôde ser salva.',
          },
          500,
        )
      }
    }

    /*
     * 13. Resposta para a interface.
     */
    return json({
      conteudo: content,

      cached: false,

      origem:
        generated.provider,
    })
  } catch (error) {
    console.error(
      '[AI Study] Erro:',
      error,
    )

    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Não foi possível processar a solicitação.',
      },
      500,
    )
  }
}