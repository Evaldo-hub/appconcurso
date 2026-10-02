'use client'

import { useState } from 'react'
import {
  BookOpen,
  Brain,
  Building2,
  CheckCircle2,
  ChevronDown,
  Layers3,
  Lightbulb,
  ListTree,
  Scale,
  Star,
  Target,
  TriangleAlert,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { parseMindMapContent, type MindMap } from '@/lib/ai/mind-map-schema'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { StudyMarkdown } from '@/components/estudar/study-markdown'

const icons: Record<MindMap['ramos'][number]['icone'], LucideIcon> = {
  target: Target,
  book: BookOpen,
  brain: Brain,
  workflow: Workflow,
  layers: Layers3,
  building: Building2,
  scale: Scale,
  list: ListTree,
  check: CheckCircle2,
  alert: TriangleAlert,
  lightbulb: Lightbulb,
}

export function MindMapContent({ content }: { content: string }) {
  const map = parseMindMapContent(content)
  return map ? <MindMapVisual map={map} /> : <StudyMarkdown content={content} mode="mapa_mental" />
}

export function MindMapVisual({ map }: { map: MindMap }) {
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set())

  const toggle = (index: number) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  return <section aria-labelledby="mind-map-title" className="mx-auto w-full max-w-6xl space-y-8">
    <header className="space-y-3 text-center">
      <p className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><Brain className="h-5 w-5" aria-hidden="true" />Mapa mental</p>
      <h2 id="mind-map-title" className="text-2xl font-bold tracking-tight sm:text-3xl">{map.titulo}</h2>
      <p className="mx-auto max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{map.descricao}</p>
    </header>

    <div className="relative pb-2">
      <div className="mx-auto max-w-xl rounded-2xl border-2 border-primary/40 bg-primary/5 px-5 py-6 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Tema central</p>
        <p className="mt-2 text-xl font-bold">{map.titulo}</p>
      </div>
      <div className="mx-auto hidden h-10 w-px bg-border sm:block" aria-hidden="true" />

      <div className="relative grid gap-5 sm:grid-cols-2 xl:grid-cols-3 xl:gap-6">
        <div className="absolute inset-x-[12%] top-0 hidden border-t sm:block" aria-hidden="true" />
        {map.ramos.map((branch, index) => {
          const Icon = icons[branch.icone] ?? Brain
          const expanded = !collapsed.has(index)
          const regionId = `mind-map-branch-${index}`
          return <article key={`${branch.titulo}-${index}`} className="relative pt-5 sm:pt-8">
            <div className="absolute left-1/2 top-0 hidden h-8 border-l sm:block" aria-hidden="true" />
            <div className="h-full overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md">
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={regionId}
                onClick={() => toggle(index)}
                className="flex w-full items-center gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:p-5"
              >
                <span className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <h3 className="min-w-0 flex-1 font-semibold leading-snug">{branch.titulo}</h3>
                <ChevronDown className={cn('h-5 w-5 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
              </button>
              <div id={regionId} hidden={!expanded} className="border-t px-4 pb-5 pt-4 sm:px-5">
                <ul className="space-y-4">
                  {branch.itens.map((item, itemIndex) => <li key={`${item.titulo}-${itemIndex}`} className="relative border-l-2 border-primary/25 pl-4">
                    <span className="absolute -left-[5px] top-2 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                    <h4 className="text-sm font-semibold">{item.titulo}</h4>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.descricao}</p>
                  </li>)}
                </ul>
              </div>
            </div>
          </article>
        })}
      </div>
    </div>

    <section aria-labelledby="mind-map-memorize" className="rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:p-6">
      <h3 id="mind-map-memorize" className="flex items-center gap-2 text-lg font-bold"><Star className="h-5 w-5 text-primary" aria-hidden="true" />O que memorizar para a prova</h3>
      <ol className="mt-5 grid gap-3 md:grid-cols-2">
        {map.memorizar.map((item, index) => <li key={`${item}-${index}`} className="flex gap-3 rounded-xl border bg-background p-4 shadow-sm">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{String(index + 1).padStart(2, '0')}</span>
          <p className="self-center text-sm font-medium leading-6">{item}</p>
        </li>)}
      </ol>
    </section>
  </section>
}

export function MindMapSkeleton() {
  return <div className="mx-auto w-full max-w-6xl space-y-8" role="status" aria-label="Gerando mapa mental">
    <div className="space-y-3 text-center"><Skeleton className="mx-auto h-4 w-28" /><Skeleton className="mx-auto h-8 w-72 max-w-full" /><Skeleton className="mx-auto h-4 w-96 max-w-full" /></div>
    <Skeleton className="mx-auto h-28 max-w-xl rounded-2xl" />
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>
    <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-20 rounded-xl" /><Skeleton className="h-20 rounded-xl" /></div>
  </div>
}
