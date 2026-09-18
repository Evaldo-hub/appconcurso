import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ConcursoState {
  concursoAtual: string | null
  setConcursoAtual: (concursoId: string | null) => void
}

export const useConcursoStore = create<ConcursoState>()(
  persist(
    (set) => ({
      concursoAtual: null,
      setConcursoAtual: (concursoId) => set({ concursoAtual: concursoId }),
    }),
    {
      name: 'concurso-storage',
    }
  )
)
