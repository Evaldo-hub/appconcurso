'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdmin } from '@/lib/supabase/require-admin'
import { createClient } from '@/lib/supabase/server'

const text = z.string().trim().max(500).default('')
const concursoSchema = z.object({
  id: z.string().default(''), nome: z.string().trim().min(1).max(300), orgao: z.string().trim().min(1).max(300),
  banca: text, ano: z.string().default(''), edital: text, cargo: text, especialidade: text,
  data_prova: z.string().default(''), descricao: z.string().trim().max(10000).default(''),
})
const provaSchema = z.object({
  id: z.string().default(''), concurso_id: z.coerce.number().int().positive(), nome: z.string().trim().min(1).max(300),
  cargo: text, especialidade: text, codigo_prova: text, turno: text,
})

export async function saveConcursoAction(formData: FormData) {
  await requireAdmin()
  const parsed = concursoSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) redirect('/admin/concursos/novo?erro=campos')
  const value = parsed.data
  const id = value.id ? Number(value.id) : null
  const year = value.ano ? Number(value.ano) : null
  if ((id !== null && (!Number.isSafeInteger(id) || id < 1)) || (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2200))) redirect('/admin/concursos/novo?erro=campos')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_salvar_concurso', {
    p_id: id, p_nome: value.nome, p_orgao: value.orgao, p_banca: value.banca, p_ano: year,
    p_edital: value.edital, p_cargo: value.cargo, p_especialidade: value.especialidade,
    p_data_prova: value.data_prova || null, p_descricao: value.descricao,
  })
  if (error) redirect(`/admin/concursos/${id ?? 'novo'}?erro=migration`)
  revalidatePath('/admin/concursos')
  redirect(`/admin/concursos/${data}?salvo=1`)
}

export async function saveProvaAction(formData: FormData) {
  await requireAdmin()
  const parsed = provaSchema.safeParse(Object.fromEntries(formData.entries()))
  const fallback = String(formData.get('concurso_id') ?? '')
  if (!parsed.success) redirect(`/admin/concursos/${fallback}?erro=prova`)
  const value = parsed.data
  const id = value.id ? Number(value.id) : null
  if (id !== null && (!Number.isSafeInteger(id) || id < 1)) redirect(`/admin/concursos/${value.concurso_id}?erro=prova`)
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_salvar_prova', {
    p_id: id, p_concurso_id: value.concurso_id, p_nome: value.nome, p_cargo: value.cargo,
    p_especialidade: value.especialidade, p_codigo_prova: value.codigo_prova, p_turno: value.turno,
  })
  if (error) redirect(`/admin/concursos/${value.concurso_id}?erro=migration`)
  revalidatePath(`/admin/concursos/${value.concurso_id}`)
  redirect(`/admin/concursos/${value.concurso_id}?salvo=1`)
}
