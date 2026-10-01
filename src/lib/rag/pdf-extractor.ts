import 'server-only'

import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import type { PdfTextExtractor } from './extract-text'

function isTextItem(item: unknown): item is TextItem {
  return typeof item === 'object' && item !== null && 'str' in item
}

type PositionedTextItem = Pick<TextItem, 'str' | 'hasEOL' | 'transform' | 'width' | 'height'>

const LINE_TOLERANCE_RATIO = 0.25
const WORD_GAP_RATIO = 0.15

/**
 * Reconstrói texto sem inserir espaços indiscriminadamente. O PDF.js pode
 * fornecer espaços como TextItems próprios; quando não fornece, um intervalo
 * horizontal maior que 15% da altura da fonte representa separação visual de
 * palavras. Variações verticais acima de 25% da maior altura indicam nova linha.
 */
export function reconstructPdfPageText(items: readonly PositionedTextItem[]) {
  let output = ''
  let previous: PositionedTextItem | null = null

  const appendLineBreak = () => {
    output = output.replace(/[ \t]+$/g, '')
    if (output && !output.endsWith('\n')) output += '\n'
  }

  for (const item of items) {
    const value = item.str.normalize('NFC')
    if (!value) {
      if (item.hasEOL) appendLineBreak()
      previous = null
      continue
    }

    if (/^\s+$/u.test(value)) {
      if (output && !/[\s]$/u.test(output)) output += ' '
      if (item.hasEOL) appendLineBreak()
      previous = null
      continue
    }

    if (previous && output && !/[\s]$/u.test(output) && !/^\s/u.test(value)) {
      const fontSize = Math.max(previous.height, item.height, Math.abs(previous.transform[0]), Math.abs(item.transform[0]), 1)
      const yDifference = Math.abs(item.transform[5] - previous.transform[5])
      const sameLine = yDifference <= fontSize * LINE_TOLERANCE_RATIO
      const previousEndX = previous.transform[4] + previous.width
      const horizontalGap = item.transform[4] - previousEndX

      if (!sameLine || item.transform[4] < previous.transform[4] - fontSize * LINE_TOLERANCE_RATIO) appendLineBreak()
      else if (horizontalGap < -fontSize * LINE_TOLERANCE_RATIO || horizontalGap > fontSize * WORD_GAP_RATIO) output += ' '
    }

    output += value
    if (item.hasEOL) appendLineBreak()
    previous = item.hasEOL ? null : item
  }

  return output.trim()
}

export function createPdfJsTextExtractor(): PdfTextExtractor {
  return {
    async extract(file) {
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
      const loadingTask = getDocument({ data: file.bytes.slice(), isEvalSupported: false })
      const document = await loadingTask.promise
      try {
        const metadata = await document.getMetadata().catch(() => null)
        const info = metadata?.info as { Title?: unknown } | undefined
        const title = typeof info?.Title === 'string' && info.Title.trim() ? info.Title.trim() : null
        const sections = []
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          const page = await document.getPage(pageNumber)
          const textContent = await page.getTextContent()
          const items = textContent.items.filter(isTextItem)
          sections.push({ content: reconstructPdfPageText(items), page: pageNumber, title, section: null })
          page.cleanup()
        }
        return { title, sections }
      } finally {
        await document.destroy()
      }
    },
  }
}
