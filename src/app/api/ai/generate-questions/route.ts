import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const inputSchema = z.object({
  concurso_id: z.coerce.number().int().positive(),
  prova_id: z.coerce.number().int().positive(),
  disciplina: z.string().trim().min(1).max(200),
  assunto: z.string().trim().min(1).max(300),
  banca: z.string().trim().min(1).max(200),
  dificuldade: z.enum(['Fácil', 'Média', 'Difícil']),
  quantidade: z.coerce.number().int().min(1).max(50),
})

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status })

export async function POST(request: NextRequest) {
  try {
    const expectedOrigin = process.env.NEXT_PUBLIC_APP_URL
    const origin = request.headers.get('origin')
    if (expectedOrigin && origin && origin !== expectedOrigin) return json({ error: 'Origem não permitida.' }, 403)

    const webhookUrl = process.env.N8N_GENERATE_QUESTIONS_WEBHOOK_URL
      ?? process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL
      ?? process.env.N8N_WEBHOOK_URL
    if (!webhookUrl) return json({ error: 'Webhook de geração não configurado.' }, 503)

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return json({ error: 'Sessão inválida ou expirada.' }, 401)

    const parsed = inputSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return json({ error: 'Revise os campos da geração.' }, 400)
    const input = parsed.data
    const admin = createAdminClient()

    const { data: hasAccess, error: accessError } = await admin.rpc('usuario_tem_acesso', { p_usuario_id: user.id })
    if (accessError && accessError.code !== 'PGRST202') return json({ error: 'Não foi possível validar seu acesso.' }, 503)
    if (!accessError && !hasAccess) return json({ error: 'Seu período de acesso expirou.' }, 403)

    const [{ data: exam }, { data: metadata }] = await Promise.all([
      admin.from('provas').select('id').eq('id', input.prova_id).eq('concurso_id', input.concurso_id).maybeSingle(),
      admin.from('questoes_estudo').select('id').eq('disciplina', input.disciplina).eq('assunto', input.assunto).eq('banca', input.banca).limit(1).maybeSingle(),
    ])
    if (!exam) return json({ error: 'A prova não pertence ao concurso selecionado.' }, 400)
    if (!metadata) return json({ error: 'A combinação de disciplina, assunto e banca não existe no catálogo.' }, 400)

    const { data: allowed, error: limitError } = await admin.rpc('consumir_limite_integracao', {
      p_usuario_id: user.id, p_chave: 'gerar-questoes', p_limite: 10, p_janela_segundos: 600,
    })
    if (limitError) return json({ error: 'Controle de segurança indisponível.' }, 503)
    if (!allowed) return json({ error: 'Muitas gerações solicitadas. Aguarde alguns minutos.' }, 429)

    const sessionId = crypto.randomUUID()
    const startedAt = new Date().toISOString()
    const command = `Gere ${input.quantidade} questões de ${input.disciplina} sobre ${input.assunto}, nível ${input.dificuldade}, no estilo ${input.banca}.`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120000)
    let webhookResponse: Response
    try {
      webhookResponse = await fetch(webhookUrl, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(process.env.N8N_API_KEY ? { 'X-API-Key': process.env.N8N_API_KEY } : {}) },
        body: JSON.stringify({ acao: 'gerar_questoes', usuario_id: user.id, session_id: sessionId, concurso_id: input.concurso_id, prova_id: input.prova_id, disciplina: input.disciplina, assunto: input.assunto, banca: input.banca, dificuldade: input.dificuldade, quantidade: input.quantidade, comando: command, origem: 'app' }),
      })
    } catch (error) {
      return json({ error: error instanceof DOMException && error.name === 'AbortError' ? 'A geração excedeu o tempo máximo de dois minutos.' : 'Não foi possível conectar ao webhook do n8n.' }, error instanceof DOMException && error.name === 'AbortError' ? 504 : 502)
    } finally { clearTimeout(timeout) }

    const responseText = await webhookResponse.text()
    if (!webhookResponse.ok) return json({ error: `O n8n não conseguiu processar a geração (HTTP ${webhookResponse.status}).` }, 502)
    if (!responseText.trim()) return json({ error: 'O workflow terminou sem retornar JSON. No n8n, conecte todos os ramos ao nó Respond to Webhook.' }, 502)

    let parsedResponse: unknown
    try { parsedResponse = JSON.parse(responseText) } catch { return json({ error: 'O workflow respondeu, mas o conteúdo não é um JSON válido.' }, 502) }
    const firstItem = Array.isArray(parsedResponse) ? parsedResponse[0] : parsedResponse
    const wrappedItem = firstItem && typeof firstItem === 'object' && 'json' in firstItem
      ? (firstItem as { json?: unknown }).json
      : firstItem
    const result = wrappedItem && typeof wrappedItem === 'object' ? wrappedItem as Record<string, unknown> : null
    const succeeded = result?.sucesso === true || result?.sucesso === 'true'
    if (!result || !succeeded) {
      const workflowMessage = typeof result?.resposta === 'string' ? result.resposta : typeof result?.error === 'string' ? result.error : ''
      return json({ error: workflowMessage || 'O n8n retornou uma resposta de geração sem sucesso.' }, 502)
    }

    let questionIds = Array.isArray(result.questao_ids) ? result.questao_ids.map(Number).filter(Number.isSafeInteger) : []
    if (questionIds.length === 0) {
      const expected = Math.max(0, Number(result.cadastradas) || 0)
      if (expected > 0) {
        const { data } = await admin.from('questoes_estudo').select('id').eq('concurso_id', input.concurso_id).eq('prova_id', input.prova_id).eq('disciplina', input.disciplina).eq('assunto', input.assunto).gte('criado_em', startedAt).order('criado_em', { ascending: false }).limit(expected)
        questionIds = (data ?? []).map((item) => Number(item.id)).filter(Number.isSafeInteger)
      }
    }

    return json({ sucesso: true, total_analisadas: Math.max(0, Number(result.total_analisadas) || 0), cadastradas: Math.max(0, Number(result.cadastradas) || 0), duplicadas: Math.max(0, Number(result.duplicadas) || 0), erros: Math.max(0, Number(result.erros) || 0), resposta: typeof result.resposta === 'string' ? result.resposta : '', session_id: typeof result.session_id === 'string' ? result.session_id : sessionId, usuario_id: user.id, origem: 'n8n', questao_ids: questionIds, filtros: input })
  } catch {
    return json({ error: 'Não foi possível processar a geração.' }, 500)
  }
}
