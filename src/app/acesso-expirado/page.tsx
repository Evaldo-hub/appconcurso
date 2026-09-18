'use client'

import { Clock3, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ExpiredAccessPage() {
  const router = useRouter()
  const leave = async () => { await createClient().auth.signOut(); router.replace('/login'); router.refresh() }
  return <main className="flex min-h-screen items-center justify-center bg-background p-4"><Card className="w-full max-w-lg"><CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="text-primary" />Acesso expirado</CardTitle></CardHeader><CardContent className="space-y-5"><p className="text-muted-foreground">Seu período de acesso terminou ou sua conta está bloqueada. Entre em contato com o administrador para renovar seu plano.</p><Button variant="outline" onClick={() => void leave()}><LogOut />Sair da conta</Button></CardContent></Card></main>
}
