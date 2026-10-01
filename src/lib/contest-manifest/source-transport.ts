const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

export function encodeManifestSource(source: string) {
  return Buffer.from(source, 'utf8').toString('base64')
}

export function decodeManifestSource(encoded: string) {
  if (!encoded || !base64Pattern.test(encoded)) throw new Error('O conteúdo codificado do manifesto é inválido. Gere um novo Preview.')
  const source = Buffer.from(encoded, 'base64').toString('utf8')
  if (encodeManifestSource(source) !== encoded) throw new Error('O conteúdo codificado do manifesto é inválido. Gere um novo Preview.')
  return source
}
