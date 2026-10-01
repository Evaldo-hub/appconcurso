import { retrieveRagContext } from '../src/lib/rag/retrieval'
import { assertRagRetrievalCliEnvironment } from './rag-cli-env'
import { formatRagRetrievalCliResult, parseRagRetrievalCliArguments } from './rag-retrieval-cli'

async function main() {
  const environmentStatuses = assertRagRetrievalCliEnvironment()
  if (process.argv.includes('--check')) {
    for (const status of environmentStatuses) console.log(`${status.label}: present`)
    console.log('RAG_RETRIEVAL_CLI_BOOTSTRAP_OK')
    return
  }

  const input = parseRagRetrievalCliArguments(process.argv.slice(2))
  const result = await retrieveRagContext(input)
  console.log(JSON.stringify(formatRagRetrievalCliResult(result), null, 2))
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Falha inesperada no retrieval RAG.')
  process.exitCode = 1
})
