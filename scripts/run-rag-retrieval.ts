import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

const worker = fileURLToPath(new URL('./run-rag-retrieval-worker.ts', import.meta.url))
const child = spawn(
  process.execPath,
  ['--conditions=react-server', '--import', 'tsx', worker, ...process.argv.slice(2)],
  { stdio: 'inherit', env: process.env },
)

child.once('error', (error) => {
  console.error(`Falha ao iniciar o worker de retrieval RAG: ${error.message}`)
  process.exitCode = 1
})
child.once('exit', (code) => { process.exitCode = code ?? 1 })
