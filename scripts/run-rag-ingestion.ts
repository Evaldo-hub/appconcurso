import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadEnvConfig } from '@next/env'

// Reproduz a precedência oficial do Next fora de seu runtime e preserva
// variáveis que já tenham sido fornecidas ao processo.
loadEnvConfig(process.cwd())

const worker = fileURLToPath(new URL('./run-rag-ingestion-worker.ts', import.meta.url))
const child = spawn(
  process.execPath,
  ['--conditions=react-server', '--import', 'tsx', worker, ...process.argv.slice(2)],
  { stdio: 'inherit', env: process.env },
)

let forwardingSignal = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    forwardingSignal = true
    child.kill(signal)
  })
}

child.once('error', (error) => {
  console.error(`Falha ao iniciar o worker RAG: ${error.message}`)
  process.exitCode = 1
})

child.once('exit', (code, signal) => {
  if (forwardingSignal && signal) return
  process.exitCode = code ?? 1
})
