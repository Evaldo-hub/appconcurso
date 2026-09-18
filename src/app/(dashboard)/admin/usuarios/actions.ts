'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdmin } from '@/lib/supabase/require-admin'
import { createClient } from '@/lib/supabase/server'

const schema=z.object({usuario_id:z.string().uuid(),dias:z.coerce.number().int().min(1).max(1095),status:z.enum(['ativo','bloqueado'])})
export async function defineStudentAccessAction(formData:FormData){
  await requireAdmin(); const parsed=schema.safeParse(Object.fromEntries(formData.entries())); if(!parsed.success)redirect('/admin/usuarios?erro=campos')
  const supabase=await createClient(); const {error}=await supabase.rpc('admin_definir_acesso_estudante',{p_usuario_id:parsed.data.usuario_id,p_dias:parsed.data.dias,p_status:parsed.data.status})
  if(error)redirect('/admin/usuarios?erro=migration'); revalidatePath('/admin/usuarios'); redirect('/admin/usuarios?salvo=1')
}
