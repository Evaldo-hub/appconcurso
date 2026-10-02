import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

type Category = 'EDITAL' | 'NORMA_OFICIAL'
type Source = { title: string; category: Category; pattern: RegExp; subdirectory: string; githubDirectory: string; targetName: string }

const CONTEST_SLUG = 'trt8-2026'
const MAX_RAG_BYTES = 25 * 1024 * 1024
const SOURCES: readonly Source[] = [
  { title: 'Edital nº 01/2026 — TRT8', category: 'EDITAL', pattern: /^edital_no_1_trt_8a_regiao_-_abertura\.pdf$/iu, subdirectory: '', githubDirectory: 'edital', targetName: 'edital-01-2026-trt8.pdf' },
  { title: 'Resolução CNJ nº 400/2021', category: 'NORMA_OFICIAL', pattern: /^resolucao-400-2021-politica-sustentabilidade-pj\.pdf$/iu, subdirectory: 'CONTEUDO PROGRAMATICO', githubDirectory: 'normas_oficiais', targetName: 'resolucao-cnj-400-2021.pdf' },
  { title: 'Lei nº 8.112/1990', category: 'NORMA_OFICIAL', pattern: /LEI Nº 8\.112.+\.pdf$/iu, subdirectory: 'CONTEUDO PROGRAMATICO', githubDirectory: 'normas_oficiais', targetName: 'lei-8112-1990.pdf' },
  { title: 'Lei nº 8.429/1992', category: 'NORMA_OFICIAL', pattern: /LEI Nº 8\.429.+\.pdf$/iu, subdirectory: 'CONTEUDO PROGRAMATICO', githubDirectory: 'normas_oficiais', targetName: 'lei-8429-1992.pdf' },
  { title: 'Lei nº 9.784/1999', category: 'NORMA_OFICIAL', pattern: /LEI Nº 9\.784.+\.pdf$/iu, subdirectory: 'CONTEUDO PROGRAMATICO', githubDirectory: 'normas_oficiais', targetName: 'lei-9784-1999.pdf' },
  { title: 'Lei nº 14.133/2021', category: 'NORMA_OFICIAL', pattern: /LEI Nº 14\.133.+\.pdf$/iu, subdirectory: 'CONTEUDO PROGRAMATICO', githubDirectory: 'normas_oficiais', targetName: 'lei-14133-2021.pdf' },
  { title: 'Lei nº 13.146/2015', category: 'NORMA_OFICIAL', pattern: /LEI Nº 13\.146.+\.pdf$/iu, subdirectory: 'CONTEUDO PROGRAMATICO', githubDirectory: 'normas_oficiais', targetName: 'lei-13146-2015.pdf' },
]

function argument(name: string) {
  const index = process.argv.indexOf(name)
  return index < 0 ? null : process.argv[index + 1] ?? null
}

async function loadEnvironment(fileName: string) {
  const values: Record<string, string> = {}
  for (const line of (await readFile(fileName, 'utf8')).split(/\r?\n/u)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u)
    if (match) values[match[1]] = match[2].trim().replace(/^['"]|['"]$/gu, '')
  }
  return values
}

async function pdfTextStats(filePath: string) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const document = await getDocument({ data: new Uint8Array(await readFile(filePath)), isEvalSupported: false }).promise
  let textPages = 0
  let characters = 0
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const text = (await page.getTextContent()).items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .trim()
      if (text) textPages += 1
      characters += text.length
      page.cleanup()
    }
    return { pages: document.numPages, textPages, characters }
  } finally {
    await document.destroy()
  }
}

async function main() {
  if (process.argv.includes('--execute')) throw new Error('DRY_RUN_ONLY: --execute não é permitido neste script.')
  const sourceDir = argument('--source-dir')
  if (!sourceDir) throw new Error('Informe --source-dir com a pasta TRT8 controlada.')

  const env = await loadEnvironment(path.resolve('.env.local'))
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error('Configuração Supabase de servidor ausente.')
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const contestResult = await supabase.from('concursos').select('id').eq('slug', CONTEST_SLUG)
  if (contestResult.error || contestResult.data?.length !== 1) throw contestResult.error ?? new Error('Concurso não resolvido unicamente pelo slug.')
  const contestId = contestResult.data[0].id
  const materialResult = await supabase.from('materiais_concurso').select('id,arquivo_origem,github_path').eq('concurso_id', contestId)
  if (materialResult.error) throw materialResult.error
  const materialIds = (materialResult.data ?? []).map((item) => item.id)
  let ingestions: Array<{ material_id: number }> = []
  if (materialIds.length > 0) {
    const ingestionResult = await supabase.from('rag_ingestoes').select('material_id').in('material_id', materialIds)
    if (ingestionResult.error) throw ingestionResult.error
    ingestions = ingestionResult.data ?? []
  }

  const rows = []
  for (const source of SOURCES) {
    const directory = path.join(sourceDir, source.subdirectory)
    const names = await readdir(directory).catch(() => [])
    const matches = names.filter((name) => source.pattern.test(name))
    if (matches.length !== 1) {
      rows.push({ arquivo: matches.length === 0 ? '(ausente)' : matches.join(' | '), sha256: null, categoria: source.category, concurso_slug: CONTEST_SLUG, prova: null, status_arquivo: matches.length === 0 ? 'AUSENTE' : 'AMBIGUO', material_existente: false, ingestao_existente: false, acao_planejada: 'ARQUIVO_AUSENTE' })
      continue
    }
    const fileName = matches[0]
    const filePath = path.join(directory, fileName)
    const bytes = await readFile(filePath)
    const stats = await pdfTextStats(filePath)
    const githubPath = `concursos/trt8/2026/${source.githubDirectory}/${source.targetName}`
    const existing = (materialResult.data ?? []).find((item) => item.arquivo_origem === fileName || item.github_path === githubPath)
    const hasIngestion = existing ? ingestions.some((item) => item.material_id === existing.id) : false
    const status = stats.characters === 0 && bytes.byteLength > MAX_RAG_BYTES
      ? 'SEM_TEXTO_EXTRAIVEL_E_EXCEDE_LIMITE_25_MIB'
      : stats.characters === 0
        ? 'SEM_TEXTO_EXTRAIVEL'
        : bytes.byteLength > MAX_RAG_BYTES
          ? 'EXCEDE_LIMITE_25_MIB'
          : 'APTO_PARA_PREPARACAO'
    rows.push({
      arquivo: filePath,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      categoria: source.category,
      concurso_slug: CONTEST_SLUG,
      prova: null,
      status_arquivo: status,
      paginas: stats.pages,
      paginas_com_texto: stats.textPages,
      caracteres_extraidos: stats.characters,
      material_existente: Boolean(existing),
      ingestao_existente: hasIngestion,
      acao_planejada: status !== 'APTO_PARA_PREPARACAO' ? 'ARQUIVO_INCOMPATIVEL' : existing ? (hasIngestion ? 'REPROCESSAR' : 'INGERIR') : 'CRIAR_MATERIAL',
      github_path_planejado: githubPath,
    })
  }
  console.log(JSON.stringify({ mode: 'DRY_RUN', contest_slug: CONTEST_SLUG, contest_id_resolved: contestId, writes: 0, embeddings: 0, rows }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
