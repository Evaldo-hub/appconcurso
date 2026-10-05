import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { exceedsRagUploadLimit, MAX_RAG_UPLOAD_BYTES } from './upload-limits'

test('limite funcional compartilhado é 25 MiB e inclusivo', () => {
  assert.equal(MAX_RAG_UPLOAD_BYTES, 25 * 1024 * 1024)
  assert.equal(exceedsRagUploadLimit(MAX_RAG_UPLOAD_BYTES), false)
  assert.equal(exceedsRagUploadLimit(MAX_RAG_UPLOAD_BYTES + 1), true)
})

test('Next reserva 30 MiB para proxy e Server Actions', () => {
  const config = readFileSync('next.config.ts', 'utf8')
  assert.match(config, /proxyClientMaxBodySize:\s*['"]30mb['"]/)
  assert.match(config, /serverActions:\s*\{\s*bodySizeLimit:\s*['"]30mb['"]\s*\}/)
  assert.doesNotMatch(config, /bodySizeLimit:\s*['"]11mb['"]|middlewareClientMaxBodySize/)
})

test('formulário e feedback comunicam 25 MiB e validam antes do envio', () => {
  const form = readFileSync('src/app/(dashboard)/admin/concursos/[id]/new-rag-material-form.tsx', 'utf8')
  const page = readFileSync('src/app/(dashboard)/admin/concursos/[id]/page.tsx', 'utf8')
  assert.match(form, /exceedsRagUploadLimit/)
  assert.match(form, /onSubmit=\{handleSubmit\}/)
  assert.match(form, /até 25 MiB/)
  assert.match(form, /role="alert"/)
  assert.match(page, /upload_large: 'O arquivo excede o limite de 25 MiB\.'/)
  assert.doesNotMatch(`${form}\n${page}`, /10 MiB/)
})
