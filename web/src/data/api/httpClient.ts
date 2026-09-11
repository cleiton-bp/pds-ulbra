/**
 * Injeta o token, desembrulha o envelope `ApiResponse<T>` e transforma qualquer
 * falha em `PanelError`. Nenhuma tela sabe que existe envelope.
 */

import type { ApiResponse } from '@/contracts'
import { environment } from '@/data/environment'
import { PanelError } from '@/data/errors'
import { clearToken, getToken, notifyUnauthorized } from '@/data/sessionToken'

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

interface RequestOptions {
  /** `false` no login: la um 401 e credencial recusada, nao sessao expirada. */
  handleUnauthorized?: boolean
}

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(`${environment.apiUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    // Status 0: nem chegou a haver resposta. Quem le precisa conferir se a API
    // esta no ar, e nao tentar de novo — dai valer a distincao.
    throw new PanelError('Falha de rede ao contatar a API.', 0)
  }

  if (response.status === 401 && (options.handleUnauthorized ?? true)) {
    clearToken()
    notifyUnauthorized()
    throw new PanelError('Sessão expirada. Entre de novo.', 401)
  }

  const envelope = await response
    .json()
    .then((data) => data as ApiResponse<T>)
    .catch(() => null)

  if (!response.ok || envelope?.Success === false) {
    throw new PanelError(envelope?.Message ?? `Erro ${response.status}.`, response.status)
  }

  return (envelope?.Data ?? null) as T
}

export const apiGet = <T>(path: string) => request<T>('GET', path)
export const apiPost = <T>(path: string, body?: unknown, options?: RequestOptions) =>
  request<T>('POST', path, body, options)
export const apiPatch = <T>(path: string, body?: unknown) => request<T>('PATCH', path, body)

// A resposta de remocao vem com `Data: null`, e o envelope so carrega a mensagem.
// Dai o `void`: nao ha o que desembrulhar.
export const apiDelete = (path: string) => request<void>('DELETE', path)
