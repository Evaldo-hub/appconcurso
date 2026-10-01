import 'server-only'

import { RAG_CONFIG } from './config'
import type { ExtractedDocument, RagChunk } from './types'

type ChunkDraft = Omit<RagChunk, 'index' | 'contentSha256'>

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / RAG_CONFIG.chunking.approximateCharactersPerToken)
}

function splitOversizedUnit(unit: string, maxCharacters: number): string[] {
  if (unit.length <= maxCharacters) return [unit]
  const sentences = unit.match(/[^.!?;:\n]+(?:[.!?;:]+|$)/g)?.map((item) => item.trim()).filter(Boolean) ?? [unit]
  const parts: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if (sentence.length > maxCharacters) {
      if (current) parts.push(current)
      current = ''
      const words = sentence.split(/\s+/)
      let wordGroup = ''
      for (const word of words) {
        const candidate = wordGroup ? `${wordGroup} ${word}` : word
        if (wordGroup && candidate.length > maxCharacters) {
          parts.push(wordGroup)
          wordGroup = word
        } else {
          wordGroup = candidate
        }
      }
      if (wordGroup) parts.push(wordGroup)
    } else if (!current || `${current} ${sentence}`.length <= maxCharacters) {
      current = current ? `${current} ${sentence}` : sentence
    } else {
      parts.push(current)
      current = sentence
    }
  }
  if (current) parts.push(current)
  return parts.filter(Boolean)
}

function semanticUnits(content: string, maxCharacters: number) {
  return content
    .split(/\n{2,}/)
    .flatMap((block) => splitOversizedUnit(block.trim(), maxCharacters))
    .filter(Boolean)
}

function trailingOverlap(content: string, maxCharacters: number) {
  if (maxCharacters <= 0) return ''
  const paragraphs = content.split(/\n{2,}/)
  let overlap = ''
  for (let index = paragraphs.length - 1; index >= 0; index -= 1) {
    const candidate = overlap ? `${paragraphs[index]}\n\n${overlap}` : paragraphs[index]
    if (candidate.length > maxCharacters) break
    overlap = candidate
  }
  return overlap
}

export function chunkExtractedDocument(document: ExtractedDocument): ChunkDraft[] {
  const charsPerToken = RAG_CONFIG.chunking.approximateCharactersPerToken
  const targetCharacters = RAG_CONFIG.chunking.targetTokens * charsPerToken
  const maxCharacters = RAG_CONFIG.chunking.maxTokens * charsPerToken
  const overlapCharacters = RAG_CONFIG.chunking.maxOverlapTokens * charsPerToken
  const chunks: ChunkDraft[] = []

  for (const section of document.sections) {
    const units = semanticUnits(section.content, maxCharacters)
    let current = ''
    let hasNewContent = false
    const flush = () => {
      const content = current.trim()
      if (!content || !hasNewContent) return
      chunks.push({ content, estimatedTokens: estimateTokens(content), page: section.page, title: section.title ?? document.title, section: section.section })
      hasNewContent = false
    }

    for (const unit of units) {
      const candidate = current ? `${current}\n\n${unit}` : unit
      if (current && candidate.length > maxCharacters) {
        flush()
        const overlap = trailingOverlap(current, overlapCharacters)
        current = overlap ? `${overlap}\n\n${unit}` : unit
        hasNewContent = true
      } else {
        current = candidate
        hasNewContent = true
      }
      if (current.length >= targetCharacters) {
        flush()
        current = trailingOverlap(current, overlapCharacters)
      }
    }
    flush()
  }

  return chunks
}
