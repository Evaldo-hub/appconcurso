import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { prepareNormalizedBootstrap } from '../src/lib/normalized-contest-import/prepare'
import { parseTrt82026SourceText } from '../src/lib/normalized-contest-import/trt8-source'

const sourcePath = process.argv[2]
if (!sourcePath) {
  console.error('Uso: npx tsx scripts/trt8-2026-normalized-dry-run.ts <manifesto.json>')
  process.exitCode = 1
} else {
  const source = await readFile(resolve(sourcePath), 'utf8')
  const parsed = parseTrt82026SourceText(source)
  if (!parsed.success) {
    console.error(JSON.stringify({ valid: false, errors: parsed.errors }, null, 2))
    process.exitCode = 1
  } else {
    const preparation = prepareNormalizedBootstrap(parsed.manifest, {
      legacyContestIdIgnored: true,
      declaredCommonBlocks: parsed.declaredCommonBlocks,
      examSchooling: parsed.examSchooling,
    })
    console.log(JSON.stringify({
      valid: true,
      source: {
        schemaVersion: parsed.source.schema_version,
        slug: parsed.source.slug,
        name: parsed.source.nome,
        organization: parsed.source.orgao,
        board: parsed.source.banca,
        year: parsed.source.ano,
        notice: parsed.source.edital,
        examDate: parsed.source.data_prova,
        legacyContestId: parsed.legacyContestId,
        materials: parsed.source.materiais.length,
      },
      dryRun: preparation.dryRun,
    }, null, 2))
  }
}
