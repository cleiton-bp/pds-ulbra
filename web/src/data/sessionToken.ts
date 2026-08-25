/**
 * Token da sessao no navegador. Serve aos dois modos: JWT no modo API, token de
 * faz de conta no mock. `localStorage` e nao cookie porque a API valida
 * `Authorization: Bearer` e nao mantem sessao propria.
 *
 * Sem `localStorage` (armazenamento bloqueado, Node dos testes) cai para memoria:
 * a sessao deixa de sobreviver a um recarregamento, que e melhor que recusar a entrada.
 */

const STORAGE_KEY = 'pds.web.session.v1'

/** A API respondeu 401 no meio da navegacao; a casca escuta e volta ao login. */
export const UNAUTHORIZED_EVENT = 'pds:unauthorized'

let memoryToken: string | null = null

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function getToken(): string | null {
  return storage()?.getItem(STORAGE_KEY) ?? memoryToken
}

export function setToken(token: string): void {
  memoryToken = token
  storage()?.setItem(STORAGE_KEY, token)
}

export function clearToken(): void {
  memoryToken = null
  storage()?.removeItem(STORAGE_KEY)
}

export function notifyUnauthorized(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
}
