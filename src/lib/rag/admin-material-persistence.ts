import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { listarDisciplinasDaProva, listarDisciplinasDoConcurso, type NormalizedSelectionCatalog } from '@/lib/contest-catalog/selection'
import { loadNormalizedTaxonomyForContest } from '@/lib/contest-catalog/queries'
import type { RagMaterialInsert, RagMaterialInsertRow, RagMaterialRegistrationRepository } from './admin-material'

export function createRagMaterialRegistrationRepository(admin: SupabaseClient): RagMaterialRegistrationRepository {
  return {
    async contestExists(concursoId) {
      const { data, error } = await admin.from('concursos').select('id').eq('id', concursoId).maybeSingle<{ id: number }>()
      if (error) throw error
      return data !== null
    },
    async examBelongsToContest(provaId, concursoId) {
      const { data, error } = await admin.from('provas').select('id').eq('id', provaId).eq('concurso_id', concursoId).maybeSingle<{ id: number }>()
      if (error) throw error
      return data !== null
    },
    async disciplineBelongsToSelection(discipline, concursoId, provaId) {
      const taxonomy = await loadNormalizedTaxonomyForContest(admin, concursoId)
      const catalog: NormalizedSelectionCatalog = { contests: [], exams: [], taxonomy }
      const disciplines = provaId === null
        ? listarDisciplinasDoConcurso(catalog, concursoId)
        : listarDisciplinasDaProva(catalog, provaId)
      return disciplines.includes(discipline)
    },
    async duplicateExists(concursoId, provaId, githubPath) {
      let query = admin.from('materiais_concurso').select('id').eq('concurso_id', concursoId).eq('github_path', githubPath)
      query = provaId === null ? query.is('prova_id', null) : query.eq('prova_id', provaId)
      const { data, error } = await query.limit(1)
      if (error) throw error
      return (data?.length ?? 0) > 0
    },
    async insertMaterial(material: RagMaterialInsert) {
      const { data, error } = await admin.from('materiais_concurso').insert(material).select('id').single<RagMaterialInsertRow>()
      if (error || !data) throw error ?? new Error('Material não retornado após o cadastro.')
      return data
    },
  }
}
