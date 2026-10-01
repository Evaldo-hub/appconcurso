import assert from 'node:assert/strict'
import test from 'node:test'
import { getRagGitHubConfig, RagGitHubConfigError } from './config'

test('configuração GitHub ausente registra somente presença e falha com código seguro', () => {
  const names = ['RAG_GITHUB_OWNER', 'RAG_GITHUB_REPOSITORY', 'RAG_GITHUB_REF', 'RAG_GITHUB_TOKEN'] as const
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]))
  const originalConsoleError = console.error
  const logs: unknown[][] = []
  try {
    for (const name of names) delete process.env[name]
    console.error = (...values: unknown[]) => { logs.push(values) }
    assert.throws(getRagGitHubConfig, (error) => error instanceof RagGitHubConfigError && error.message === 'RAG_GITHUB_CONFIG_MISSING')
  } finally {
    console.error = originalConsoleError
    for (const name of names) {
      const value = previous[name]
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
  assert.deepEqual(logs, [['[RAG_GITHUB_CONFIG_MISSING]', {
    ownerPresent: false,
    repositoryPresent: false,
    refPresent: false,
    tokenPresent: false,
  }]])
})
