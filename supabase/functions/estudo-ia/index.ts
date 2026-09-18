import { createClient } from 'npm:@supabase/supabase-js@2'

const allowedActions = ['explicacao', 'resumo', 'aula', 'pergunta'] as const
type Action = typeof allowedActions[number]

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const response = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return response({ error: 'Método não permitido.' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const n8nUrl = Deno.env.get('N8N_WEBHOOK_URL')
    const n8nKey = Deno.env.get('N8N_API_KEY')
    const authorization = request.headers.get('Authorization')
    if (!supabaseUrl || !anonKey || !serviceKey || !n8nUrl || !n8nKey) return response({ error: 'Integração de IA não configurada.' }, 503)
    if (!authorization) return response({ error: 'Sessão não encontrada.' }, 401)

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
    const admin = createClient(supabaseUrl, serviceKey)
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return response({ error: 'Sessão inválida ou expirada.' }, 401)

    const { data: hasAccess, error: accessError } = await admin.rpc('usuario_tem_acesso', { p_usuario_id: user.id })
    if (accessError && accessError.code !== 'PGRST202') return response({ error: 'Não foi possível validar seu acesso.' }, 503)
    if (!accessError && !hasAccess) return response({ error: 'Seu período de acesso expirou.' }, 403)

    const input = await request.json().catch(() => null) as { questao_id?: unknown; acao?: unknown; pergunta?: unknown } | null
    const questionId = Number(input?.questao_id)
    const action = input?.acao as Action
    const question = typeof input?.pergunta === 'string' ? input.pergunta.trim() : ''
    if (!Number.isSafeInteger(questionId) || questionId < 1 || !allowedActions.includes(action)) return response({ error: 'Solicitação inválida.' }, 400)
    if (action === 'pergunta' && (question.length < 1 || question.length > 2000)) return response({ error: 'A pergunta deve ter entre 1 e 2000 caracteres.' }, 400)

    const { data: allowed, error: limitError } = await admin.rpc('consumir_limite_integracao', {
      p_usuario_id: user.id, p_chave: 'estudo-ia', p_limite: 20, p_janela_segundos: 300,
    })
    if (limitError) return response({ error: 'Controle de segurança indisponível.' }, 503)
    if (!allowed) return response({ error: 'Muitas solicitações. Aguarde alguns minutos.' }, 429)

    const [{ data: directAnswer }, { data: simulationAnswer }] = await Promise.all([
      admin.from('respostas_questoes').select('id').eq('usuario_id', user.id).eq('questao_id', questionId).limit(1).maybeSingle(),
      admin.from('respostas_simulado').select('id, simulados!inner(status)').eq('usuario_id', user.id).eq('questao_id', questionId).eq('simulados.status', 'concluido').limit(1).maybeSingle(),
    ])
    if (!directAnswer && !simulationAnswer) return response({ error: 'Responda à questão antes de estudá-la.' }, 403)

    if (action !== 'pergunta') {
      const { data: cached } = await admin.from('estudo_questao').select('conteudo').eq('questao_id', questionId).eq('tipo', action).order('id', { ascending: false }).limit(1).maybeSingle()
      if (cached?.conteudo) return response({ conteudo: cached.conteudo, cached: true })
    }

    const [{ data: questionData, error: questionError }, { data: sources }] = await Promise.all([
      admin.from('questoes_estudo').select('id, disciplina, assunto, subassunto, enunciado, explicacao').eq('id', questionId).single(),
      admin.from('questao_fontes').select('arquivo_origem, document_id, pagina, trecho').eq('questao_id', questionId),
    ])
    if (questionError || !questionData) return response({ error: 'Questão não encontrada.' }, 404)
    if (action === 'explicacao' && questionData.explicacao) return response({ conteudo: questionData.explicacao, cached: true })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 45000)
    let n8nResponse: Response
    try {
      n8nResponse = await fetch(n8nUrl, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-API-Key': n8nKey },
        body: JSON.stringify({ usuario_id: user.id, questao_id: questionId, acao: action, pergunta: action === 'pergunta' ? question : undefined, questao: questionData, fontes: sources ?? [] }),
      })
    } catch (fetchError) {
      if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return response({ error: 'A geração demorou mais que o esperado. Tente novamente.' }, 504)
      return response({ error: 'O serviço de IA está temporariamente indisponível.' }, 502)
    } finally { clearTimeout(timeout) }

    if (!n8nResponse.ok) return response({ error: 'O serviço de IA não conseguiu processar a solicitação.' }, 502)
    const result = await n8nResponse.json().catch(() => null) as { conteudo?: unknown; resposta?: unknown } | null
    const content = typeof result?.conteudo === 'string' ? result.conteudo.trim() : typeof result?.resposta === 'string' ? result.resposta.trim() : ''
    if (!content || content.length > 200000) return response({ error: 'O serviço de IA retornou uma resposta inválida.' }, 502)

    const publicSources = (sources ?? []).map((source) => ({ arquivo: source.arquivo_origem, pagina: source.pagina }))
    if (action === 'pergunta') {
      const { error: saveError } = await admin.from('conversas_estudo_ia').insert({ usuario_id: user.id, questao_id: questionId, pergunta: question, resposta: content, fontes: publicSources })
      if (saveError) return response({ error: 'A resposta foi gerada, mas não pôde ser salva.' }, 500)
    } else {
      const { error: saveError } = await admin.from('estudo_questao').insert({ questao_id: questionId, tipo: action, conteudo: content })
      if (saveError) return response({ error: 'O conteúdo foi gerado, mas não pôde ser salvo.' }, 500)
    }
    return response({ conteudo: content, cached: false, fontes: publicSources })
  } catch {
    return response({ error: 'Não foi possível processar a solicitação.' }, 500)
  }
})
