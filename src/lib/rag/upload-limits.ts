export const MAX_RAG_UPLOAD_BYTES = 25 * 1024 * 1024

export function exceedsRagUploadLimit(size: number) {
  return !Number.isSafeInteger(size) || size > MAX_RAG_UPLOAD_BYTES
}
