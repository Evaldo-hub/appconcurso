import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

const allowedActions = ['explicacao', 'resumo', 'aula', 'pergunta'] as const
type Action = typeof allowedActions[number]
const n8nTypeByAction: Record<Action, string> = {
  explicacao: 'explicacao_rapida',
  resumo: 'resumo',
  aula: 'aula',
  pergunta: 'pergunta',
}

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status })

export async function POST(request: NextRequest) {
  try {
    const expectedOrigin = process.env.NEXT_PUBLIC_APP_URL
    const origin = request.headers.get('origin')
    if (expectedOrigin && origin && origin !== expectedOrigin) return json({ error: 'Origem não permitida.' }, 403)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
    const n8nUrl = process.env.N8N_STUDY_WEBHOOK_URL
    const n8nKey = process.env.N8N_API_KEY
    if (!supabaseUrl || !serviceKey || !n8nUrl || !n8nKey) return json({ error: 'Gateway local de IA não configurado.' }, 503)

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return json({ error: 'Sessão inválida ou expirada.' }, 401)
    const admin = createAdminClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

    const { data: hasAccess, error: accessError } = await admin.rpc('usuario_tem_acesso', { p_usuario_id: user.id })
    if (accessError && accessError.code !== 'PGRST202') return json({ error: 'Não foi possível validar seu acesso.' }, 503)
    if (!accessError && !hasAccess) return json({ error: 'Seu período de acesso expirou.' }, 403)

    const input = await request.json().catch(() => null) as { questao_id?: unknown; acao?: unknown; session_id?: unknown; pergunta?: unknown } | null
    const questionId = Number(input?.questao_id)
    const action = input?.acao as Action
    const sessionId = typeof input?.session_id === 'string' ? input.session_id : ''
    const question = typeof input?.pergunta === 'string' ? input.pergunta.trim() : ''
    if (!Number.isSafeInteger(questionId) || questionId < 1 || !allowedActions.includes(action)) return json({ error: 'Solicitação inválida.' }, 400)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) return json({ error: 'Sessão de estudo inválida. Atualize a página e tente novamente.' }, 400)
    if (action === 'pergunta' && (question.length < 1 || question.length > 2000)) return json({ error: 'A pergunta deve ter entre 1 e 2000 caracteres.' }, 400)

    const { data: allowed, error: limitError } = await admin.rpc('consumir_limite_integracao', {
      p_usuario_id: user.id, p_chave: 'estudo-ia', p_limite: 20, p_janela_segundos: 300,
    })
    if (limitError) return json({ error: 'Controle de segurança indisponível.' }, 503)
    if (!allowed) return json({ error: 'Muitas solicitações. Aguarde alguns minutos.' }, 429)

    const { data: authorizedStudy, error: studyError } = await supabase.rpc('obter_estudo_questao_seguro', { p_questao_id: questionId })
    if (studyError || !authorizedStudy) return json({ error: studyError?.message || 'Responda à questão antes de estudá-la.' }, studyError?.code === '42501' ? 403 : 400)
    const study = authorizedStudy as { conteudos?: Record<string, string | null> }
    if (action !== 'pergunta' && study.conteudos?.[action]) return json({ conteudo: study.conteudos[action], cached: true })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 45000)
    let n8nResponse: Response
    try {
      n8nResponse = await fetch(n8nUrl, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-API-Key': n8nKey },
        body: JSON.stringify({ acao: 'estudar_questao', tipo: n8nTypeByAction[action], questao_id: questionId, usuario_id: user.id, session_id: sessionId, ...(action === 'pergunta' ? { pergunta: question } : {}) }),
      })
    } catch (fetchError) {
      if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return json({ error: 'A geração demorou mais que o esperado.' }, 504)
      return json({ error: 'Não foi possível conectar ao n8n local.' }, 502)
    } finally { clearTimeout(timeout) }

    const responseBody = await n8nResponse.json().catch(() => null) as unknown
    const firstItem = Array.isArray(responseBody) ? responseBody[0] : responseBody
    const unwrappedItem = firstItem && typeof firstItem === 'object' && 'json' in firstItem
      ? (firstItem as { json?: unknown }).json
      : firstItem
    const result = unwrappedItem && typeof unwrappedItem === 'object'
      ? unwrappedItem as { success?: unknown; sucesso?: unknown; output?: unknown; cache?: unknown; error?: unknown; resposta?: unknown }
      : null
    if (!n8nResponse.ok) {
      const workflowError = typeof result?.error === 'string' ? result.error : typeof result?.resposta === 'string' ? result.resposta : ''
      return json({ error: workflowError || 'O serviço de IA não conseguiu processar a solicitação.' }, 502)
    }
    const succeeded = result?.success === true || result?.sucesso === true
    if (!succeeded) {
      const workflowError = typeof result?.error === 'string' ? result.error : typeof result?.resposta === 'string' ? result.resposta : ''
      return json({ error: workflowError || 'Não foi possível gerar o conteúdo solicitado.' }, 502)
    }
    const content = typeof result?.output === 'string' ? result.output.trim() : ''
    if (!content || content.length > 200000) return json({ error: 'O n8n retornou uma resposta inválida.' }, 502)

    const cached = result.cache === true
    if (!cached) {
      const saveResult = action === 'pergunta'
        ? await admin.from('conversas_estudo_ia').insert({ usuario_id: user.id, questao_id: questionId, pergunta: question, resposta: content, fontes: [] })
        : await admin.from('estudo_questao').insert({ questao_id: questionId, tipo: action, conteudo: content })
      if (saveResult.error) return json({ error: 'A resposta foi gerada, mas não pôde ser salva.' }, 500)
    }
    return json({ conteudo: content, cached })
  } catch {
    return json({ error: 'Não foi possível processar a solicitação.' }, 500)
  }
}
