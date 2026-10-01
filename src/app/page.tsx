import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const whatsappUrl = 'https://wa.me/5591981989492?text=Ol%C3%A1%21%20Vim%20pelo%20aplicativo%20de%20estudos.'

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-4xl space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">
            Plataforma Inteligente de Estudos para Concursos
          </h1>
          <p className="text-xl text-muted-foreground">
            Sistema completo para preparação de concursos públicos com IA e RAG
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Banco de Questões</CardTitle>
              <CardDescription>
                Acesso a milhares de questões de concursos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Filtre por disciplina, assunto, banca e dificuldade
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Simulados</CardTitle>
              <CardDescription>
                Crie simulados personalizados
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Simule provas reais com cronômetro e análise de desempenho
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>IA e RAG</CardTitle>
              <CardDescription>
                Explicações personalizadas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Receba explicações, resumos e aulas geradas por IA
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-center gap-4">
          <Button asChild size="lg">
            <Link href="/login">Entrar</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/register">Criar conta</Link>
          </Button>
        </div>

        <div className="flex justify-center">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Fale comigo pelo WhatsApp no número (91) 98198-9492"
          >
            <MessageCircle className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-left">
              <span className="block text-xs text-muted-foreground">Fale comigo pelo WhatsApp</span>
              <span className="font-medium">(91) 98198-9492</span>
            </span>
          </a>
        </div>
      </div>
    </div>
  )
}
