import { createClient } from '@/lib/supabase/client'

export interface TelegramLink { chatId: number; username: string | null; nome: string | null; vinculadoEm: string }
export interface TelegramCode { codigo: string; expiraEm: string }

class TelegramService {
  private supabase = createClient()
  async getLink(): Promise<TelegramLink | null> {
    const { data, error } = await this.supabase.from('telegram_vinculos').select('chat_id, username, nome, vinculado_em').eq('ativo', true).maybeSingle()
    if (error) { if (error.code === 'PGRST205') throw new Error('A migration da Fase 13 ainda precisa ser aplicada.'); throw new Error('Não foi possível consultar o vínculo do Telegram.') }
    return data ? { chatId: data.chat_id, username: data.username, nome: data.nome, vinculadoEm: data.vinculado_em } : null
  }
  async generateCode(): Promise<TelegramCode> {
    const { data, error } = await this.supabase.rpc('gerar_codigo_vinculo_telegram').single()
    if (error) throw new Error('Não foi possível gerar o código de vínculo.')
    const result = data as unknown as { codigo: string; expira_em: string }
    return { codigo: result.codigo, expiraEm: result.expira_em }
  }
  async unlink() { const { error } = await this.supabase.rpc('desvincular_telegram'); if (error) throw new Error('Não foi possível desvincular o Telegram.') }
}

export const telegramService = new TelegramService()
