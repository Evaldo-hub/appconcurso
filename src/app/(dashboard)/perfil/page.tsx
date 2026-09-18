'use client'

import { CheckCircle2, Clipboard, Loader2, RefreshCw, Send, Unlink, User } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useTelegram } from '@/hooks/useTelegram'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function PerfilPage() {
  const { user } = useAuth(); const { link, code, loading, working, error, refresh, generate, unlink } = useTelegram(); const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
  const command = code ? `/start ${code.codigo}` : ''
  return <div className="space-y-6 fade-in"><div><h1 className="text-2xl font-bold md:text-3xl">Perfil</h1><p className="text-muted-foreground">Gerencie sua conta e integrações.</p></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />Dados da conta</CardTitle></CardHeader><CardContent><p className="font-medium">{user?.user_metadata?.nome || 'Estudante'}</p><p className="text-sm text-muted-foreground">{user?.email}</p></CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Send className="h-5 w-5" />Telegram</CardTitle><CardDescription>Use o mesmo histórico e desempenho no aplicativo e no bot.</CardDescription></CardHeader><CardContent className="space-y-4">
      {loading ? <Skeleton className="h-24 w-full" /> : error ? <Alert variant="destructive"><p>{error}</p></Alert> : link ? <div className="space-y-4"><Alert className="border-green-600 bg-green-50 dark:bg-green-950/30"><div className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-green-600" /><div><p className="font-semibold">Telegram vinculado</p><p className="text-sm">{link.nome || (link.username ? `@${link.username}` : `Chat ${link.chatId}`)}</p></div></div></Alert><Button variant="destructive" onClick={() => void unlink()} disabled={working}><Unlink />Desvincular</Button></div>
      : code ? <div className="space-y-4"><p className="text-sm">Envie este comando ao bot em até 10 minutos:</p><div className="flex flex-wrap items-center gap-2"><code className="rounded-lg bg-muted px-4 py-3 text-lg font-bold tracking-wider">{command}</code><Button variant="outline" onClick={() => void navigator.clipboard.writeText(command)}><Clipboard />Copiar</Button>{botUsername && <Button onClick={() => window.open(`https://t.me/${botUsername.replace('@','')}?start=${code.codigo}`, '_blank', 'noopener,noreferrer')}><Send />Abrir bot</Button>}</div><p className="text-xs text-muted-foreground">Expira às {new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date(code.expiraEm))}.</p><div className="flex gap-2"><Button variant="outline" onClick={() => void refresh()} disabled={working}><RefreshCw />Verificar vínculo</Button><Button variant="ghost" onClick={() => void generate()} disabled={working}>Gerar outro código</Button></div></div>
      : <div className="space-y-3"><p className="text-sm text-muted-foreground">Gere um código temporário e envie ao bot para associar seu chat com segurança.</p><Button onClick={() => void generate()} disabled={working}>{working ? <Loader2 className="animate-spin" /> : <Send />}Gerar código de vínculo</Button></div>}
    </CardContent></Card>
  </div>
}
