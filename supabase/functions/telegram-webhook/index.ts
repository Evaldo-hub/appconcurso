import { createClient } from 'npm:@supabase/supabase-js@2'

interface TelegramUpdate {
  update_id: number
  message?: { message_id: number; text?: string; chat: { id: number }; from?: { username?: string; first_name?: string; last_name?: string } }
}

const ok = () => new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
  if (!webhookSecret || request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== webhookSecret) return new Response('Unauthorized', { status: 401 })

  try {
    const update = await request.json() as TelegramUpdate
    const message = update.message
    if (!message?.text) return ok()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const n8nUrl = Deno.env.get('N8N_TELEGRAM_WEBHOOK_URL')
    const n8nKey = Deno.env.get('N8N_API_KEY')
    if (!supabaseUrl || !serviceKey || !botToken || !n8nUrl || !n8nKey) return new Response('Not configured', { status: 503 })

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const send = async (text: string) => {
      for (let start = 0; start < text.length; start += 4000) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: message.chat.id, text: text.slice(start, start + 4000) }) })
      }
    }

    const text = message.text.trim()
    const startMatch = text.match(/^\/start(?:\s+([A-Za-z0-9]+))?$/i)
    if (startMatch) {
      if (!startMatch[1]) { await send('Abra seu Perfil no aplicativo, gere um código de vínculo e envie /start CODIGO.'); return ok() }
      const from = message.from
      const name = [from?.first_name, from?.last_name].filter(Boolean).join(' ')
      const { error } = await admin.rpc('vincular_telegram_por_codigo', { p_codigo: startMatch[1], p_chat_id: message.chat.id, p_username: from?.username ?? '', p_nome: name })
      await send(error ? 'Código inválido ou expirado. Gere um novo código no aplicativo.' : 'Telegram vinculado com sucesso. Agora você pode pedir questões, responder, solicitar explicações e consultar seu desempenho.')
      return ok()
    }

    if (/^\/desvincular$/i.test(text)) {
      await admin.rpc('desvincular_telegram_por_chat', { p_chat_id: message.chat.id })
      await send('Conta desvinculada. Você pode gerar um novo código no aplicativo quando quiser.')
      return ok()
    }

    const { data: link } = await admin.from('telegram_vinculos').select('usuario_id').eq('chat_id', message.chat.id).eq('ativo', true).maybeSingle()
    if (!link) { await send('Este Telegram ainda não está vinculado. Gere um código no Perfil do aplicativo e envie /start CODIGO.'); return ok() }

    const { data: hasAccess, error: accessError } = await admin.rpc('usuario_tem_acesso', { p_usuario_id: link.usuario_id })
    if (accessError && accessError.code !== 'PGRST202') { await send('Não foi possível validar seu período de acesso.'); return ok() }
    if (!accessError && !hasAccess) { await send('Seu período de acesso expirou. Entre em contato com o administrador para renovar.'); return ok() }

    const { data: allowed, error: limitError } = await admin.rpc('consumir_limite_integracao', {
      p_usuario_id: link.usuario_id, p_chave: 'telegram', p_limite: 30, p_janela_segundos: 300,
    })
    if (limitError) { await send('O controle de segurança está temporariamente indisponível.'); return ok() }
    if (!allowed) { await send('Você enviou muitas solicitações. Aguarde alguns minutos e tente novamente.'); return ok() }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 40000)
    try {
      const n8nResponse = await fetch(n8nUrl, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-API-Key': n8nKey },
        body: JSON.stringify({ canal: 'telegram', usuario_id: link.usuario_id, telegram_chat_id: message.chat.id, telegram_message_id: message.message_id, mensagem: text }),
      })
      if (!n8nResponse.ok) { await send('Não consegui processar sua solicitação agora. Tente novamente em instantes.'); return ok() }
      const result = await n8nResponse.json().catch(() => null) as { resposta?: unknown; conteudo?: unknown } | null
      const answer = typeof result?.resposta === 'string' ? result.resposta.trim() : typeof result?.conteudo === 'string' ? result.conteudo.trim() : ''
      await send(answer || 'O serviço não retornou uma resposta. Tente reformular sua solicitação.')
    } catch { await send('O serviço demorou mais que o esperado. Tente novamente.') }
    finally { clearTimeout(timeout) }
    return ok()
  } catch { return ok() }
})
