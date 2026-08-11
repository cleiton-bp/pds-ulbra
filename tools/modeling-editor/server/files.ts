import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Acesso ao disco. Tudo restrito a uma unica pasta — ver `resolveSafe`. */

const here = path.dirname(fileURLToPath(import.meta.url))

// server/ -> raiz do editor -> database-models
export const CONTENT_DIR = path.resolve(here, '..', 'database-models')

// So nome simples terminado em .yaml. Barra, ".." ou nome vazio sao recusados: sem isso
// o navegador conseguiria gravar em qualquer lugar do disco.
const SAFE_NAME = /^[a-z0-9][a-z0-9._-]*\.yaml$/i

export type ApiError = Error & { status: number; payload?: Record<string, unknown> }

export const fail = (message: string, status: number, payload?: Record<string, unknown>): ApiError =>
  Object.assign(new Error(message), { status, payload })

function resolveSafe(name: unknown): string {
  if (typeof name !== 'string' || !SAFE_NAME.test(name) || name.includes('..')) {
    throw fail('nome de arquivo inválido', 400)
  }
  const full = path.join(CONTENT_DIR, name)
  // Cinto e suspensorio: mesmo com a regex, confere que o caminho final ficou dentro da pasta.
  if (path.dirname(full) !== CONTENT_DIR) {
    throw fail('caminho fora da pasta de modelagem', 400)
  }
  return full
}

const mtimeOf = async (full: string): Promise<number> => (await fs.stat(full)).mtimeMs

export type FileEntry = { name: string; mtime: number; size: number }

export async function listFiles(): Promise<{ dir: string; files: FileEntry[] }> {
  await fs.mkdir(CONTENT_DIR, { recursive: true })
  const names = await fs.readdir(CONTENT_DIR)
  const files: FileEntry[] = []

  for (const name of names) {
    if (!SAFE_NAME.test(name)) continue
    const stat = await fs.stat(path.join(CONTENT_DIR, name))
    if (!stat.isFile()) continue
    files.push({ name, mtime: stat.mtimeMs, size: stat.size })
  }

  files.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return { dir: CONTENT_DIR, files }
}

export async function readFile(name: unknown): Promise<{ name: string; content: string; mtime: number }> {
  const full = resolveSafe(name)
  const content = await fs.readFile(full, 'utf8')
  return { name: name as string, content, mtime: await mtimeOf(full) }
}

/**
 * Grava so se o arquivo no disco ainda estiver na versao que o editor abriu.
 * Se alguem mexeu no meio do caminho, devolve 409 e o navegador mostra a faixa de
 * conflito — em vez de apagar em silencio o trabalho do outro.
 *
 * `baseMtime` ausente significa "sobrescreve mesmo assim", usado quando a pessoa
 * escolhe explicitamente manter a versao da tela.
 */
export async function writeFile(
  name: unknown,
  content: unknown,
  baseMtime: unknown,
): Promise<{ name: string; mtime: number }> {
  const full = resolveSafe(name)
  if (typeof content !== 'string') throw fail('conteúdo ausente', 400)

  const current = await mtimeOf(full)
  // Tolerancia de 1ms: alguns sistemas de arquivo arredondam o mtime.
  if (typeof baseMtime === 'number' && Math.abs(current - baseMtime) > 1) {
    throw fail('o arquivo mudou no disco', 409, {
      conflict: true,
      mtime: current,
      content: await fs.readFile(full, 'utf8'),
    })
  }

  await fs.writeFile(full, content, 'utf8')
  return { name: name as string, mtime: await mtimeOf(full) }
}

export async function createFile(name: unknown, content: string): Promise<{ name: string; mtime: number }> {
  const full = resolveSafe(name)
  await fs.mkdir(CONTENT_DIR, { recursive: true })
  try {
    // flag wx falha se ja existir — evita zerar um arquivo por engano.
    await fs.writeFile(full, content, { encoding: 'utf8', flag: 'wx' })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      throw fail('já existe um arquivo com esse nome', 409)
    }
    throw err
  }
  return { name: name as string, mtime: await mtimeOf(full) }
}

export async function deleteFile(name: unknown): Promise<{ name: string }> {
  const full = resolveSafe(name)
  await fs.unlink(full)
  return { name: name as string }
}
