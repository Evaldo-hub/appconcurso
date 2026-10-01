export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string; id: string }
  | { type: 'paragraph'; text: string }
  | { type: 'unordered-list'; items: string[] }
  | { type: 'ordered-list'; items: string[] }
  | { type: 'math'; expression: string }
  | { type: 'horizontal-rule' }
  | { type: 'code'; code: string; language: string | null }

const headingPattern = /^(#{1,3})\s+(.+)$/
const unorderedItemPattern = /^[-*]\s+(.+)$/
const orderedItemPattern = /^\d+[.)]\s+(.+)$/
const horizontalRulePattern = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/

export function headingId(text: string, index: number) {
  const slug = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  return `secao-${slug || 'conteudo'}-${index}`
}

export function parseStudyMarkdown(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let lineIndex = 0
  let headingIndex = 0

  while (lineIndex < lines.length) {
    const line = lines[lineIndex]
    if (!line.trim()) {
      lineIndex += 1
      continue
    }

    if (line.trimStart().startsWith('```')) {
      const language = line.trim().slice(3).trim() || null
      const code: string[] = []
      lineIndex += 1
      while (lineIndex < lines.length && !lines[lineIndex].trimStart().startsWith('```')) {
        code.push(lines[lineIndex])
        lineIndex += 1
      }
      if (lineIndex < lines.length) lineIndex += 1
      blocks.push({ type: 'code', code: code.join('\n'), language })
      continue
    }

    if (line.trim() === '\\[') {
      const expression: string[] = []
      lineIndex += 1
      while (lineIndex < lines.length && lines[lineIndex].trim() !== '\\]') {
        expression.push(lines[lineIndex].trim())
        lineIndex += 1
      }
      if (lineIndex < lines.length) lineIndex += 1
      blocks.push({ type: 'math', expression: expression.join(' ').trim() })
      continue
    }

    if (horizontalRulePattern.test(line)) {
      blocks.push({ type: 'horizontal-rule' })
      lineIndex += 1
      continue
    }

    const heading = line.match(headingPattern)
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3
      const text = heading[2].trim()
      blocks.push({ type: 'heading', level, text, id: headingId(text, headingIndex) })
      headingIndex += 1
      lineIndex += 1
      continue
    }

    const unorderedItem = line.match(unorderedItemPattern)
    if (unorderedItem) {
      const items: string[] = []
      while (lineIndex < lines.length) {
        const match = lines[lineIndex].match(unorderedItemPattern)
        if (!match) break
        items.push(match[1].trim())
        lineIndex += 1
      }
      blocks.push({ type: 'unordered-list', items })
      continue
    }

    const orderedItem = line.match(orderedItemPattern)
    if (orderedItem) {
      const items: string[] = []
      while (lineIndex < lines.length) {
        const match = lines[lineIndex].match(orderedItemPattern)
        if (match) {
          items.push(match[1].trim())
          lineIndex += 1
          continue
        }
        if (
          !lines[lineIndex].trim()
          && lineIndex + 1 < lines.length
          && orderedItemPattern.test(lines[lineIndex + 1])
        ) {
          lineIndex += 1
          continue
        }
        break
      }
      blocks.push({ type: 'ordered-list', items })
      continue
    }

    const paragraph = [line.trim()]
    lineIndex += 1
    while (
      lineIndex < lines.length
      && lines[lineIndex].trim()
      && !headingPattern.test(lines[lineIndex])
      && !unorderedItemPattern.test(lines[lineIndex])
      && !orderedItemPattern.test(lines[lineIndex])
      && !horizontalRulePattern.test(lines[lineIndex])
      && !lines[lineIndex].trimStart().startsWith('```')
    ) {
      paragraph.push(lines[lineIndex].trim())
      lineIndex += 1
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
  }

  return blocks
}

const latexCommands: Record<string, string> = {
  forall: '∀', exists: '∃', neg: '¬', land: '∧', lor: '∨',
  rightarrow: '→', to: '→', leftrightarrow: '↔', equiv: '≡',
  implies: '⇒', true: '⊤', false: '⊥',
}

export function formatLatexExpression(expression: string): string {
  return expression
    .replace(/[\\](forall|exists|neg|land|lor|rightarrow|to|leftrightarrow|equiv|implies|true|false)\b/g, (_, command: string) => latexCommands[command])
    .replace(/[\\](?:quad|qquad)\b|[\\][,;:!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractStudyOutline(blocks: MarkdownBlock[]) {
  return blocks.filter(
    (block): block is Extract<MarkdownBlock, { type: 'heading' }> => block.type === 'heading' && block.level <= 2,
  )
}

export function sectionTone(text: string) {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (normalized.includes('o que memorizar') || normalized.includes('memorize')) return 'memorize'
  if (normalized.includes('pegadinha') || normalized.includes('atencao')) return 'warning'
  return 'default'
}
