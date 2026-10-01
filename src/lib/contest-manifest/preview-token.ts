import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

const changedMessage = 'O manifesto foi alterado após o Preview. Gere um novo Preview antes de sincronizar.'

function signingKey() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('Chave de assinatura do Preview não configurada no servidor.')
  return key
}

export function signManifestPreviewHash(hash: string) {
  return createHmac('sha256', signingKey()).update(hash, 'utf8').digest('hex')
}

export function assertManifestPreviewToken(hash: string, token: string) {
  const expected = Buffer.from(signManifestPreviewHash(hash), 'hex')
  const received = Buffer.from(token, 'hex')
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error(changedMessage)
}
