import 'server-only'

import type { ExtractedDocument } from './types'

export function normalizeRagText(value: string): string {
  return value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/[\t ]+$/gm, '')
    .replace(/^\s+$/gm, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

export function normalizeExtractedDocument(document: ExtractedDocument): ExtractedDocument {
  return {
    ...document,
    title: document.title ? normalizeRagText(document.title) : null,
    sections: document.sections
      .map((section) => ({
        ...section,
        content: normalizeRagText(section.content),
        title: section.title ? normalizeRagText(section.title) : null,
        section: section.section ? normalizeRagText(section.section) : null,
      }))
      .filter((section) => section.content.length > 0),
  }
}
