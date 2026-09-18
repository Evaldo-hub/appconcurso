import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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
      </div>
    </div>
  )
}
