type Environment = Readonly<Record<string, string | undefined>>

const requiredEnvironmentGroups = [
  ['NEXT_PUBLIC_SUPABASE_URL'],
  ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
  ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
  ['GEMINI_API_KEY'],
  ['RAG_GITHUB_OWNER'],
  ['RAG_GITHUB_REPOSITORY'],
  ['RAG_GITHUB_REF'],
] as const

const requiredRetrievalEnvironmentGroups = [
  ['NEXT_PUBLIC_SUPABASE_URL'],
  ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
  ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
  ['GEMINI_API_KEY'],
] as const

export interface RagCliEnvironmentStatus {
  readonly label: string
  readonly present: boolean
}

export function inspectRagCliEnvironment(env: Environment = process.env): RagCliEnvironmentStatus[] {
  return requiredEnvironmentGroups.map((names) => ({
    label: names.join('|'),
    present: names.some((name) => Boolean(env[name]?.trim())),
  }))
}

export function assertRagCliEnvironment(env: Environment = process.env): RagCliEnvironmentStatus[] {
  const statuses = inspectRagCliEnvironment(env)
  const missing = statuses.filter((status) => !status.present).map((status) => status.label)
  if (missing.length > 0) {
    throw new Error(`RAG_CLI_ENV_MISSING: ${missing.join(', ')}`)
  }
  return statuses
}

export function assertRagRetrievalCliEnvironment(env: Environment = process.env): RagCliEnvironmentStatus[] {
  const statuses = requiredRetrievalEnvironmentGroups.map((names) => ({
    label: names.join('|'),
    present: names.some((name) => Boolean(env[name]?.trim())),
  }))
  const missing = statuses.filter((status) => !status.present).map((status) => status.label)
  if (missing.length > 0) throw new Error(`RAG_RETRIEVAL_CLI_ENV_MISSING: ${missing.join(', ')}`)
  return statuses
}
