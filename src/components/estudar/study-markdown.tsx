import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { extractStudyOutline, formatLatexExpression, parseStudyMarkdown, sectionTone } from './study-markdown-parser'

interface StudyMarkdownProps {
  content: string
  mode?: 'explicacao' | 'resumo' | 'aula' | 'perguntar'
}

const inlinePattern = /(\\\([\s\S]*?\\\)|\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g

function InlineMarkdown({ children }: { children: string }) {
  const parts = children.split(inlinePattern).filter(Boolean)
  return <>{parts.map((part, index): ReactNode => {
    if (part.startsWith('\\(') && part.endsWith('\\)')) {
      const expression = formatLatexExpression(part.slice(2, -2))
      return <span key={index} role="math" aria-label={expression} className="font-mono">{expression}</span>
    }
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em] text-foreground">{part.slice(1, -1)}</code>
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>
    return <Fragment key={index}>{part}</Fragment>
  })}</>
}

export function outlineLabel(text: string): string {
  return text.replace(/^\s*\d+[.)]\s+/, '')
}

export function StudyMarkdown({ content, mode = 'explicacao' }: StudyMarkdownProps) {
  const blocks = parseStudyMarkdown(content)
  const outline = mode === 'aula' ? extractStudyOutline(blocks) : []

  return <div className="mx-auto w-full max-w-3xl">
    {outline.length >= 2 && <nav aria-label="Nesta aula" className="mb-8 rounded-xl border bg-muted/30 p-4 sm:p-5">
      <p className="mb-3 text-sm font-semibold">Nesta aula</p>
      <ol className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
        {outline.map((heading, index) => <li key={heading.id}>
          <a href={`#${heading.id}`} className="group flex gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="font-medium text-foreground/60">{index + 1}.</span>
            <span className="group-hover:text-foreground group-hover:underline">{outlineLabel(heading.text)}</span>
          </a>
        </li>)}
      </ol>
    </nav>}

    <div className="space-y-5 text-[0.975rem] leading-7 text-foreground/90 sm:text-base">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const tone = mode === 'resumo' ? sectionTone(block.text) : 'default'
          return <div
            key={`${block.id}-${index}`}
            id={block.id}
            className={cn(
              'scroll-mt-24 pt-2',
              mode === 'resumo' && block.level <= 2 && 'rounded-xl border bg-muted/20 p-4 sm:p-5',
              tone === 'memorize' && 'border-primary/30 bg-primary/5',
              tone === 'warning' && 'border-amber-500/40 bg-amber-500/5',
            )}
          >
            <div className="flex items-center gap-2">
              {block.level === 1 && <h2 className="text-2xl font-bold tracking-tight"><InlineMarkdown>{block.text}</InlineMarkdown></h2>}
              {block.level === 2 && <h3 className="text-xl font-semibold tracking-tight"><InlineMarkdown>{block.text}</InlineMarkdown></h3>}
              {block.level === 3 && <h4 className="text-lg font-semibold"><InlineMarkdown>{block.text}</InlineMarkdown></h4>}
            </div>
          </div>
        }
        if (block.type === 'unordered-list') return <ul key={index} className="ml-5 list-disc space-y-2 marker:text-primary">{block.items.map((item, itemIndex) => <li key={itemIndex} className="pl-1"><InlineMarkdown>{item}</InlineMarkdown></li>)}</ul>
        if (block.type === 'ordered-list') return <ol key={index} className="ml-5 list-decimal space-y-2 marker:font-semibold marker:text-primary">{block.items.map((item, itemIndex) => <li key={itemIndex} className="pl-1"><InlineMarkdown>{item}</InlineMarkdown></li>)}</ol>
        if (block.type === 'math') return <div key={index} role="math" aria-label={formatLatexExpression(block.expression)} className="overflow-x-auto rounded-md bg-muted/30 px-4 py-3 text-center font-mono text-base leading-7 sm:text-lg">{formatLatexExpression(block.expression)}</div>
        if (block.type === 'horizontal-rule') return <hr key={index} className="border-border" />
        if (block.type === 'code') return <div key={index} className="overflow-hidden rounded-lg border bg-slate-950 text-slate-100"><div className="border-b border-white/10 px-4 py-2 text-xs text-slate-400">{block.language ?? 'Código'}</div><pre className="overflow-x-auto p-4 text-sm leading-6"><code>{block.code}</code></pre></div>
        return <p key={index}><InlineMarkdown>{block.text}</InlineMarkdown></p>
      })}
    </div>
  </div>
}
