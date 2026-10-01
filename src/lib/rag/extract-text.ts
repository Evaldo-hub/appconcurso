import 'server-only'

import type { ExtractedDocument, ExtractedTextSection, LoadedMaterialFile, RagSupportedFileType } from './types'

export interface PdfTextExtractor {
  extract(file: LoadedMaterialFile): Promise<{ title?: string | null; sections: ExtractedTextSection[] }>
}

export interface ExtractTextDependencies {
  pdf?: PdfTextExtractor
}

function extensionOf(fileName: string): RagSupportedFileType {
  const extension = fileName.split('.').at(-1)?.toLowerCase()
  if (extension === 'pdf' || extension === 'txt' || extension === 'md') return extension
  throw new Error('Tipo de arquivo não suportado pelo RAG-V2.')
}

function decodeText(bytes: Uint8Array) {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')
}

function markdownTitle(text: string) {
  return text.match(/^\s*#\s+(.+)$/m)?.[1]?.trim() ?? null
}

export async function extractMaterialText(
  file: LoadedMaterialFile,
  dependencies: ExtractTextDependencies = {},
): Promise<ExtractedDocument> {
  const fileType = extensionOf(file.fileName)
  if (fileType === 'pdf') {
    if (!dependencies.pdf) throw new Error('O extrator PDF server-side ainda não foi configurado.')
    const extracted = await dependencies.pdf.extract(file)
    return { fileName: file.fileName, fileType, title: extracted.title ?? null, sections: extracted.sections }
  }

  const content = decodeText(file.bytes)
  return {
    fileName: file.fileName,
    fileType,
    title: fileType === 'md' ? markdownTitle(content) : null,
    sections: [{ content, page: null, title: null, section: null }],
  }
}
