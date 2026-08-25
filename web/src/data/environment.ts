/**
 * Tres modos, e a diferenca importa para quem avalia o que esta na tela:
 *
 *   mock         nada preenchido. Sessao local, dados em memoria, funciona offline.
 *   mock-google  so o client id. O Sign-In acontece de verdade, mas **ninguem
 *                confere o token** — a sessao ainda e montada pelo mock.
 *   api          `VITE_USE_API=true`. O token vai para `POST /auth/google`.
 *
 * O modo aparece escrito na tela de login: demonstracao que nao se anuncia acaba
 * confundida com sistema pronto.
 */

export type OperationMode = 'mock' | 'mock-google' | 'api'

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

const useApi = readText(import.meta.env.VITE_USE_API) === 'true'
const googleClientId = readText(import.meta.env.VITE_GOOGLE_CLIENT_ID)

export const environment = {
  useApi,
  apiUrl: (readText(import.meta.env.VITE_API_URL) || 'http://localhost:5080').replace(/\/+$/, ''),
  /** Nulo significa "sem Google configurado", e a tela de login se ajusta. */
  googleClientId: googleClientId || null,
  mode: (useApi ? 'api' : googleClientId ? 'mock-google' : 'mock') as OperationMode,
} as const

export function describeMode(mode: OperationMode): string {
  switch (mode) {
    case 'api':
      return 'Conectado à API'
    case 'mock-google':
      return 'Google real, dados de demonstração'
    case 'mock':
      return 'Dados de demonstração'
  }
}
