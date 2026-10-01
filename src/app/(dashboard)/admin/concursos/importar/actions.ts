'use server'

import { requireAdmin } from '@/lib/supabase/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { hashManifestSource } from '@/lib/contest-manifest/hash'
import { assertManifestPreviewToken, signManifestPreviewHash } from '@/lib/contest-manifest/preview-token'
import { decodeManifestSource, encodeManifestSource } from '@/lib/contest-manifest/source-transport'
import { parseContestFileText, parseProgramFileText } from '@/lib/universal-contest-import/schema'
import { buildUniversalPreview } from '@/lib/universal-contest-import/preview'
import { expandProgramFile } from '@/lib/universal-contest-import/expand'
import type { UniversalImportResult, UniversalImportState } from '@/lib/universal-contest-import/types'

const MAX_FILE_SIZE = 2 * 1024 * 1024
const emptyError = (message: string): UniversalImportState => ({ ok: false, message, errors: [], preview: null })

function validJsonFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0 && value.size <= MAX_FILE_SIZE && value.name.toLowerCase().endsWith('.json')
}

function parseSources(contestSource: string, programSource: string) {
  const contest = parseContestFileText(contestSource)
  const program = parseProgramFileText(programSource)
  const errors = [...(!contest.success ? contest.errors : []), ...(!program.success ? program.errors : [])]
  return { contest, program, errors }
}

export async function previewUniversalImportAction(_state: UniversalImportState, formData: FormData): Promise<UniversalImportState> {
  await requireAdmin()
  const contestFile = formData.get('concurso')
  const programFile = formData.get('conteudoProgramatico')
  if (!validJsonFile(contestFile) || !validJsonFile(programFile)) return emptyError('Selecione os dois arquivos JSON (máximo de 2 MiB cada).')

  const [contestSource, programSource] = await Promise.all([contestFile.text(), programFile.text()])
  const parsed = parseSources(contestSource, programSource)
  if (!parsed.contest.success || !parsed.program.success) return { ok: false, message: 'Corrija os erros estruturais antes de importar.', errors: parsed.errors, preview: null }

  try {
    const preview = await buildUniversalPreview(parsed.contest.data, parsed.program.data, createAdminClient())
    const packed = JSON.stringify({ contestSource, programSource })
    const sourceHash = hashManifestSource(packed)
    return {
      ok: !preview.bloqueado,
      message: preview.bloqueado ? 'A importação possui conflitos bloqueantes.' : 'Arquivos válidos. Nenhum dado foi gravado.',
      errors: [], preview, sourcesBase64: encodeManifestSource(packed), sourceHash,
      previewToken: signManifestPreviewHash(sourceHash), result: null,
    }
  } catch (error) {
    return emptyError(error instanceof Error ? error.message : 'Não foi possível gerar o Preview.')
  }
}

export async function confirmUniversalImportAction(_state: UniversalImportState, formData: FormData): Promise<UniversalImportState> {
  await requireAdmin()
  const encoded = formData.get('sourcesBase64')
  const sourceHash = formData.get('sourceHash')
  const previewToken = formData.get('previewToken')
  if (typeof encoded !== 'string' || typeof sourceHash !== 'string' || typeof previewToken !== 'string') return emptyError('Gere um novo Preview antes de confirmar.')
  if (formData.get('confirmImport') !== 'confirmado') return emptyError('Confirme explicitamente a importação.')

  try {
    assertManifestPreviewToken(sourceHash, previewToken)
    const packed = decodeManifestSource(encoded)
    if (hashManifestSource(packed) !== sourceHash) throw new Error('Os arquivos foram alterados após o Preview. Gere um novo Preview.')
    const sources = JSON.parse(packed) as { contestSource?: unknown; programSource?: unknown }
    if (typeof sources.contestSource !== 'string' || typeof sources.programSource !== 'string') throw new Error('Preview inválido. Gere um novo Preview.')
    const parsed = parseSources(sources.contestSource, sources.programSource)
    if (!parsed.contest.success || !parsed.program.success) return { ok: false, message: 'Os arquivos deixaram de ser válidos.', errors: parsed.errors, preview: null }

    // Revalida identidade e conflitos imediatamente antes da RPC; a RPC repete as
    // mesmas garantias dentro da transação para fechar a janela de concorrência.
    const preview = await buildUniversalPreview(parsed.contest.data, parsed.program.data, createAdminClient())
    if (preview.bloqueado) return { ok: false, message: 'O banco mudou desde o Preview e agora há conflitos.', errors: [], preview }
    const expanded = expandProgramFile(parsed.program.data)
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('admin_importar_concurso_universal', {
      p_concurso: parsed.contest.data,
      p_provas: parsed.program.data.provas,
      p_conteudos: expanded.contents,
    })
    if (error) throw new Error(error.message)
    return { ok: true, message: 'Importação concluída em uma única transação.', errors: [], preview: null, result: data as UniversalImportResult }
  } catch (error) {
    return emptyError(error instanceof Error ? error.message : 'Não foi possível concluir a importação.')
  }
}
