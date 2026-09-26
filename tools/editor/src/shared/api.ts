import type { Collection } from './environments'
import type { FileEntry } from './types'

/**
 * Cliente da API de arquivos. Cada ambiente fala com a pasta dele:
 * `/api/modeling/...` — e cada uma le a sua pasta em `database-models/`.
 *
 * Erro HTTP vira Error com `status` e o corpo da resposta.
 */

export type HttpError = Error & { status: number; body: Record<string, unknown> }

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const message = typeof body.error === 'string' ? body.error : res.statusText
    throw Object.assign(new Error(message), { status: res.status, body }) as HttpError
  }
  return body as T
}

const fileUrl = (collection: Collection, name?: string): string =>
  `/api/${collection}/file${name === undefined ? '' : `?name=${encodeURIComponent(name)}`}`

const send = <T>(collection: Collection, method: string, payload: unknown): Promise<T> =>
  fetch(fileUrl(collection), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((res) => parse<T>(res))

export type SavedFile = { name: string; mtime: number }
export type LoadedFile = { name: string; content: string; mtime: number }
export type FileList = { dir: string; files: FileEntry[] }

export const listFiles = (collection: Collection): Promise<FileList> =>
  fetch(`/api/${collection}/files`).then((res) => parse(res))

export const readFile = (collection: Collection, name: string): Promise<LoadedFile> =>
  fetch(fileUrl(collection, name)).then((res) => parse(res))

/** `baseMtime` undefined sobrescreve sem checar — so na escolha explícita da pessoa. */
export const saveFile = (
  collection: Collection,
  name: string,
  content: string,
  baseMtime?: number,
): Promise<SavedFile> => send(collection, 'PUT', { name, content, baseMtime })

export const createFile = (collection: Collection, name: string, content: string): Promise<SavedFile> =>
  send(collection, 'POST', { name, content })

export const deleteFile = (collection: Collection, name: string): Promise<{ name: string }> =>
  fetch(fileUrl(collection, name), { method: 'DELETE' }).then((res) => parse(res))
