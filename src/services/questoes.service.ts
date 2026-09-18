import { createClient } from '@/lib/supabase/client'

export interface QuestionFilters {
  concursoId: string
  provaId: string
  banca: string
  disciplina: string
  assunto: string
  subassunto: string
  dificuldade: string
  ids: string
  status: '' | 'respondidas' | 'nao_respondidas' | 'acertadas' | 'erradas'
}

export const emptyQuestionFilters: QuestionFilters = {
  concursoId: '', provaId: '', banca: '', disciplina: '', assunto: '', subassunto: '', dificuldade: '', ids: '', status: '',
}

export interface FilterOption { value: string; label: string; parentId?: string }

export interface QuestionFilterOptions {
  concursos: FilterOption[]
  provas: FilterOption[]
  bancas: FilterOption[]
  disciplinas: FilterOption[]
  assuntos: FilterOption[]
  subassuntos: FilterOption[]
  dificuldades: FilterOption[]
}

export interface QuestionListItem {
  id: string
  disciplina: string
  assunto: string
  subassunto: string | null
  banca: string | null
  dificuldade: string | null
  enunciado: string
  alternativas: { letra: string; texto: string }[]
  prova: { id: string; nome: string; cargo: string | null } | null
  concurso: { id: string; nome: string; orgao: string; ano: number } | null
}

export interface QuestionPage { question: QuestionListItem | null; total: number }

export interface AnswerResult {
  respostaId: number
  correta: boolean
  alternativaCorreta: string
  explicacao: string | null
}

interface MetadataRow {
  banca: string | null
  disciplina: string | null
  assunto: string | null
  subassunto: string | null
  dificuldade: string | null
}

interface ConcursoRelation { id: string; nome: string; orgao: string; ano: number }
interface ProvaRelation {
  id: string
  nome: string
  cargo: string | null
  concursos: ConcursoRelation | ConcursoRelation[] | null
}

interface QuestionRow extends MetadataRow {
  id: string
  concurso_id: string | null
  enunciado: string
  alternativa_a: string
  alternativa_b: string
  alternativa_c: string
  alternativa_d: string
  alternativa_e: string
  provas: ProvaRelation | ProvaRelation[] | null
}

function firstRelation<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation
}

const toOptions = (values: Array<string | null>) => Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))))
  .sort((a, b) => a.localeCompare(b, 'pt-BR'))
  .map((value) => ({ value, label: value }))

class QuestoesService {
  private supabase = createClient()

  async getFilterOptions(): Promise<QuestionFilterOptions> {
    const [concursosResult, provasResult, metadataResult] = await Promise.all([
      this.supabase.from('concursos').select('id, nome, orgao, ano').order('nome'),
      this.supabase.from('provas').select('id, concurso_id, nome, cargo').order('nome'),
      this.supabase.from('questoes_estudo').select('banca, disciplina, assunto, subassunto, dificuldade').range(0, 4999),
    ])

    const error = concursosResult.error || provasResult.error || metadataResult.error
    if (error) throw new Error('Não foi possível carregar os filtros do banco de questões.')

    const metadata = (metadataResult.data ?? []) as MetadataRow[]
    return {
      concursos: (concursosResult.data ?? []).map((item) => ({
        value: String(item.id), label: `${item.nome}${item.ano ? ` — ${item.ano}` : ''}`,
      })),
      provas: (provasResult.data ?? []).map((item) => ({
        value: String(item.id), label: `${item.nome}${item.cargo ? ` — ${item.cargo}` : ''}`, parentId: String(item.concurso_id),
      })),
      bancas: toOptions(metadata.map((item) => item.banca)),
      disciplinas: toOptions(metadata.map((item) => item.disciplina)),
      assuntos: toOptions(metadata.map((item) => item.assunto)),
      subassuntos: toOptions(metadata.map((item) => item.subassunto)),
      dificuldades: toOptions(metadata.map((item) => item.dificuldade)),
    }
  }

  async getQuestion(filters: QuestionFilters, index: number): Promise<QuestionPage> {
    let query = this.supabase
      .from('questoes_estudo')
      .select('id, concurso_id, disciplina, assunto, subassunto, banca, dificuldade, enunciado, alternativa_a, alternativa_b, alternativa_c, alternativa_d, alternativa_e, provas(id, nome, cargo, concursos(id, nome, orgao, ano))', { count: 'exact' })

    if (filters.concursoId) query = query.eq('concurso_id', filters.concursoId)
    if (filters.provaId) query = query.eq('prova_id', filters.provaId)
    if (filters.banca) query = query.eq('banca', filters.banca)
    if (filters.disciplina) query = query.eq('disciplina', filters.disciplina)
    if (filters.assunto) query = query.eq('assunto', filters.assunto)
    if (filters.subassunto) query = query.eq('subassunto', filters.subassunto)
    if (filters.dificuldade) query = query.eq('dificuldade', filters.dificuldade)
    if (filters.ids) {
      const ids = filters.ids.split(',').map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
      if (ids.length > 0) query = query.in('id', ids)
    }

    if (filters.status) {
      let answersQuery = this.supabase.from('respostas_questoes').select('questao_id, correta')
      if (filters.status === 'acertadas') answersQuery = answersQuery.eq('correta', true)
      if (filters.status === 'erradas') answersQuery = answersQuery.eq('correta', false)
      const { data: answers, error: answersError } = await answersQuery
      if (answersError) throw new Error('Os filtros de respostas dependem da migration da Fase 6.')
      const ids = Array.from(new Set((answers ?? []).map((answer) => Number(answer.questao_id))))

      if (filters.status === 'nao_respondidas') {
        if (ids.length > 0) query = query.not('id', 'in', `(${ids.join(',')})`)
      } else if (ids.length > 0) {
        query = query.in('id', ids)
      } else {
        query = query.eq('id', -1)
      }
    }

    const { data, error, count } = await query.order('id').range(index, index)
    if (error) throw new Error('Não foi possível consultar o banco de questões.')

    const row = data?.[0] as unknown as QuestionRow | undefined
    if (!row) return { question: null, total: count ?? 0 }
    const prova = firstRelation(row.provas)
    const concurso = prova ? firstRelation(prova.concursos) : null

    return {
      total: count ?? 0,
      question: {
        id: row.id,
        disciplina: row.disciplina ?? 'Sem disciplina',
        assunto: row.assunto ?? 'Sem assunto',
        subassunto: row.subassunto,
        banca: row.banca,
        dificuldade: row.dificuldade,
        enunciado: row.enunciado,
        alternativas: [
          { letra: 'A', texto: row.alternativa_a }, { letra: 'B', texto: row.alternativa_b },
          { letra: 'C', texto: row.alternativa_c }, { letra: 'D', texto: row.alternativa_d },
          { letra: 'E', texto: row.alternativa_e },
        ].filter((item) => Boolean(item.texto)),
        prova: prova ? { id: prova.id, nome: prova.nome, cargo: prova.cargo } : null,
        concurso,
      },
    }
  }

  async answerQuestion(questionId: string, alternative: string, elapsedSeconds: number): Promise<AnswerResult> {
    const { data, error } = await this.supabase.rpc('responder_questao', {
      p_questao_id: Number(questionId),
      p_alternativa: alternative,
      p_tempo_gasto: elapsedSeconds,
    }).single()

    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883') {
        throw new Error('A migration da Fase 6 ainda precisa ser aplicada no Supabase.')
      }
      if (error.code === '42501') throw new Error('Sua sessão expirou. Entre novamente para responder.')
      throw new Error('Não foi possível registrar sua resposta. Tente novamente.')
    }

    const result = data as unknown as { resposta_id: number; correta: boolean; alternativa_correta: string; explicacao: string | null }
    return { respostaId: result.resposta_id, correta: result.correta, alternativaCorreta: result.alternativa_correta, explicacao: result.explicacao }
  }
}

export const questoesService = new QuestoesService()
