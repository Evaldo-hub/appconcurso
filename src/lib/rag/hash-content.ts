import 'server-only'

import { createHash } from 'node:crypto'

export function hashRagContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

export function hashRagBytes(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}
