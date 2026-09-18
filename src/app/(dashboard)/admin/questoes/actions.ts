'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/require-admin'

const optionalText = z.string().trim().max(10000).default('')
const schema = z.object({
  id: z.coerce.number().int().positive(),
  disciplina: z.string().trim().min(1).max(200),
  assunto: z.string().trim().min(1).max(300),
  subassunto: z.string().trim().max(300).default(''),
  banca: z.string().trim().max(200).default(''),
  dificuldade: z.string().trim().max(100).default(''),
  enunciado: z.string().trim().min(1).max(50000),
  alternativa_a: optionalText,
  alternativa_b: optionalText,
  alternativa_c: optionalText,
  alternativa_d: optionalText,
  alternativa_e: optionalText,
  gabarito: z.enum(['A', 'B', 'C', 'D', 'E']),
  explicacao: z.string().trim().max(50000).default(''),
})

export async function updateQuestionAction(formData: FormData) {
  await requireAdmin()
  const raw = Object.fromEntries(formData.entries())
  const result = schema.safeParse(raw)
  const rawId = String(formData.get('id') ?? '')
  if (!result.success) redirect(`/admin/questoes/${encodeURIComponent(rawId)}?erro=campos`)

  const supabase = await createClient()
  const values = result.data
  const { error } = await supabase.rpc('admin_atualizar_questao', {
    p_questao_id: values.id,
    p_disciplina: values.disciplina,
    p_assunto: values.assunto,
    p_subassunto: values.subassunto,
    p_banca: values.banca,
    p_dificuldade: values.dificuldade,
    p_enunciado: values.enunciado,
    p_alternativa_a: values.alternativa_a,
    p_alternativa_b: values.alternativa_b,
    p_alternativa_c: values.alternativa_c,
    p_alternativa_d: values.alternativa_d,
    p_alternativa_e: values.alternativa_e,
    p_gabarito: values.gabarito,
    p_explicacao: values.explicacao,
  })
  if (error) redirect(`/admin/questoes/${values.id}?erro=migration`)

  revalidatePath('/admin')
  revalidatePath('/admin/questoes')
  revalidatePath(`/admin/questoes/${values.id}`)
  redirect(`/admin/questoes/${values.id}?salvo=1`)
}
