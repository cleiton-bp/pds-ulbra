/**
 * Fica no navegador porque **nao e dado do dominio**: e a lembranca de que este
 * navegador ja copiou a chave. Na etapa 2 o servidor sabera algo melhor — se o
 * primeiro relato chegou. Ate la, isto evita "0 de 3" para quem copiou tudo.
 */

const STORAGE_KEY = 'pds.web.onboarding.v1'

export type IntegrationStep = 'key' | 'snippet'

type Progress = Record<string, IntegrationStep[]>

function readAll(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Progress) : {}
  } catch {
    return {}
  }
}

export function readProgress(projectPublicId: string): IntegrationStep[] {
  return readAll()[projectPublicId] ?? []
}

export function markStep(projectPublicId: string, step: IntegrationStep): IntegrationStep[] {
  const all = readAll()
  const current = all[projectPublicId] ?? []
  const next = current.includes(step) ? current : [...current, step]

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...all, [projectPublicId]: next }))
  } catch {
    // Armazenamento bloqueado: o progresso vale para esta visita e pronto.
  }

  return next
}
