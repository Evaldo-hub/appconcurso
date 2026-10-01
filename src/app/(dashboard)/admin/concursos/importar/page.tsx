import Link from 'next/link'
import { UniversalContestImportForm } from './import-form'

export default function ImportContestPage() {
  return <div className="space-y-6">
    <div><Link href="/admin/concursos" className="text-sm text-muted-foreground hover:text-foreground">← Voltar aos concursos</Link><h1 className="mt-3 text-2xl font-bold">Importar concurso</h1><p className="text-sm text-muted-foreground">Importador universal baseado no schema dos arquivos. A validação e o Preview não gravam dados.</p></div>
    <UniversalContestImportForm />
  </div>
}
