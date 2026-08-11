import type { FileEntry } from '../types'

/** Cliente da API de arquivos. Erro HTTP vira Error com `status` e o corpo da resposta. */

export type HttpError = Error & { status: number; body: Record<string, unknown> }

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const message = typeof body.error === 'string' ? body.error : res.statusText
    throw Object.assign(new Error(message), { status: res.status, body }) as HttpError
  }
  return body as T
}

const send = <T>(method: string, payload: unknown): Promise<T> =>
  fetch('/api/file', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((res) => parse<T>(res))

export type SavedFile = { name: string; mtime: number }
export type LoadedFile = { name: string; content: string; mtime: number }

export const listFiles = (): Promise<{ dir: string; files: FileEntry[] }> =>
  fetch('/api/files').then((res) => parse(res))

export const readFile = (name: string): Promise<LoadedFile> =>
  fetch(`/api/file?name=${encodeURIComponent(name)}`).then((res) => parse(res))

/** `baseMtime` undefined sobrescreve sem checar — so na escolha explícita da pessoa. */
export const saveFile = (name: string, content: string, baseMtime?: number): Promise<SavedFile> =>
  send('PUT', { name, content, baseMtime })

export const createFile = (name: string, content: string): Promise<SavedFile> =>
  send('POST', { name, content })

export const deleteFile = (name: string): Promise<{ name: string }> =>
  fetch(`/api/file?name=${encodeURIComponent(name)}`, { method: 'DELETE' }).then((res) => parse(res))
