import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const pageUrl = new URL('../../app/(dashboard)/questoes/[id]/estudar/page.tsx', import.meta.url)

test('interface oferece mapa mental na ordem correta e sem overflow horizontal', async () => {
  const source = await readFile(pageUrl, 'utf8')
  const explanation = source.indexOf("value: 'explicacao'")
  const summary = source.indexOf("value: 'resumo'")
  const lesson = source.indexOf("value: 'aula'")
  const mindMap = source.indexOf("value: 'mapa_mental'")
  const ask = source.indexOf("value: 'perguntar'")
  assert.ok(explanation < summary && summary < lesson && lesson < mindMap && mindMap < ask)
  assert.match(source, /md:grid-cols-3 xl:grid-cols-5/)
  assert.doesNotMatch(source, /min-w-\[42rem\]|overflow-x-auto/)
})

test('mapa mental usa o mesmo generate dos modos automáticos', async () => {
  const source = await readFile(pageUrl, 'utf8')
  assert.match(source, /else void generate\(mode\)/)
  assert.match(source, /onGenerate=\{\(\) => void generate\(mode\)\}/)
  assert.match(source, /StudyMarkdown content=\{content\} mode=\{mode\}/)
})
