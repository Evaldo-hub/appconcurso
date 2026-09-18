'use client'

import { useEffect, useState } from 'react'
import { telegramService, type TelegramCode, type TelegramLink } from '@/services/telegram.service'

export function useTelegram() {
  const [link, setLink] = useState<TelegramLink | null>(null); const [code, setCode] = useState<TelegramCode | null>(null); const [loading, setLoading] = useState(true); const [working, setWorking] = useState(false); const [error, setError] = useState<string | null>(null)
  const refresh = async () => { setWorking(true); setError(null); try { const current = await telegramService.getLink(); setLink(current); if (current) setCode(null) } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Não foi possível consultar o Telegram.') } finally { setLoading(false); setWorking(false) } }
  useEffect(() => { let active = true; telegramService.getLink().then((current) => { if (active) { setLink(current); setError(null) } }).catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Não foi possível consultar o Telegram.') }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [])
  const generate = async () => { setWorking(true); setError(null); try { setCode(await telegramService.generateCode()) } catch (generateError) { setError(generateError instanceof Error ? generateError.message : 'Não foi possível gerar o código.') } finally { setWorking(false) } }
  const unlink = async () => { setWorking(true); setError(null); try { await telegramService.unlink(); setLink(null); setCode(null) } catch (unlinkError) { setError(unlinkError instanceof Error ? unlinkError.message : 'Não foi possível desvincular.') } finally { setWorking(false) } }
  return { link, code, loading, working, error, refresh, generate, unlink }
}
