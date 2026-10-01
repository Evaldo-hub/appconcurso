import { createHash } from 'node:crypto'

export function hashManifestSource(source: string) {
  return createHash('sha256').update(source, 'utf8').digest('hex')
}

export function assertManifestHash(source: string, expectedHash: string) {
  const actualHash = hashManifestSource(source)
  if (actualHash !== expectedHash) throw new Error('O manifesto foi alterado após o Preview. Gere um novo Preview antes de sincronizar.')
  return actualHash
}
