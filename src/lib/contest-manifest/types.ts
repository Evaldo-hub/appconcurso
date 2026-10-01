export interface ManifestSubtopic { subassunto: string; ordem: number; ativo: boolean }
export interface ManifestSubject { assunto: string; ordem: number; ativo: boolean; subassuntos: ManifestSubtopic[] }
export interface ManifestDiscipline { disciplina: string; ordem: number; ativo: boolean; assuntos: ManifestSubject[] }
export interface ManifestCommonContent { codigo: string; nome: string; ativo: boolean; disciplinas: ManifestDiscipline[] }
export interface ManifestExam { codigo: string; nome: string; cargo: string; especialidade: string | null; turno: string | null; arquivo_origem: string | null; ativo: boolean; conteudos_comuns: string[]; conteudo_programatico: ManifestDiscipline[] }
export interface ManifestMaterial { tipo_fonte: 'edital' | 'retificacao' | 'prova' | 'gabarito' | 'conteudo_programatico' | 'material_apoio' | 'legislacao' | 'outro'; tipo_arquivo: 'pdf' | 'docx' | 'txt' | 'md' | 'html'; titulo: string; arquivo: string; prova_codigo: string | null; disciplina: string | null; assunto: string | null; subassunto: string | null; ativo: boolean }
export interface ContestManifest { schema_version: 1; slug: string; nome: string; orgao: string; banca: string; ano: number; edital: string | null; data_prova: string | null; descricao: string | null; conteudos_comuns: ManifestCommonContent[]; provas: ManifestExam[]; materiais: ManifestMaterial[] }
export interface ExpandedContentRow { prova_codigo: string; disciplina: string; assunto: string | null; subassunto: string | null; ordem: number; ativo: boolean; disciplina_ordem: number; assunto_ordem: number | null; subassunto_ordem: number | null }
export interface ExpandedExam extends ManifestExam { catalogo: ExpandedContentRow[]; totais: { disciplinas: number; assuntos: number; subassuntos: number } }
export interface ExpandedManifest { manifesto: ContestManifest; provas: ExpandedExam[]; conteudos: ExpandedContentRow[]; totais: { provas: number; disciplinas: number; assuntos: number; subassuntos: number; materiais: number } }
export type DiffStatus = 'inserir' | 'atualizar' | 'sem_alteracao' | 'somente_supabase'
export type ContestDiffStatus = 'novo' | 'existente' | 'alterado' | 'sem_alteracao'
export interface PreviewItem { chave: string; titulo: string; status: DiffStatus; prova_codigo?: string }
export interface ContestManifestPreview { concurso: { id: number | null; slug: string; nome: string; orgao: string; banca: string; ano: number; status: ContestDiffStatus }; resumo: ExpandedManifest['totais']; provas: PreviewItem[]; conteudos: PreviewItem[]; materiais: PreviewItem[]; detalhes_provas: Array<{ codigo: string; nome: string; cargo: string; especialidade: string | null; disciplinas: number; assuntos: number; subassuntos: number }> }
export interface ManifestValidationError { path: string; message: string }
export interface ManifestSyncCounts { inseridos: number; atualizados: number; sem_alteracao: number; somente_supabase?: number }
export interface ManifestSyncResult { slug: string; hash: string; executado_em: string; concurso: ManifestSyncCounts; provas: ManifestSyncCounts; conteudos: ManifestSyncCounts; materiais: ManifestSyncCounts }
export interface ManifestPreviewState { ok: boolean; message: string | null; errors: ManifestValidationError[]; preview: ContestManifestPreview | null; manifestSourceBase64?: string | null; manifestHash?: string | null; previewToken?: string | null; syncResult?: ManifestSyncResult | null }
