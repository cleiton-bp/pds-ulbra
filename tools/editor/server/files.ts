import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

/**
 * Acesso ao disco. Cada ambiente tem a sua pasta, e tudo fica restrito a ela —
 * ver `resolveSafe`.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(here, '..')

/**
 * As pastas de conteudo, pelo nome que a API usa na rota — todas dentro de `database-models/`,
 * uma por ambiente. Nome de fora desta lista nao abre pasta nenhuma: e a lista, e
 * nao o pedido, que decide onde se grava.
 */
const COLLECTIONS: Record<string, string> = {
  modeling: path.join(ROOT, 'database-models', 'modeling'),
}

// So nome simples terminado em .yaml. Barra, ".." ou nome vazio sao recusados: sem isso
// o navegador conseguiria gravar em qualquer lugar do disco.
const SAFE_NAME = /^[a-z0-9][a-z0-9._-]*\.yaml$/i

export type ApiError = Error & { status: number; payload?: Record<string, unknown> }

export const fail = (message: string, status: number, payload?: Record<string, unknown>): ApiError =>
  Object.assign(new Error(message), { status, payload })

export function collectionDir(collection: string): string {
  const dir = Object.prototype.hasOwnProperty.call(COLLECTIONS, collection) ? COLLECTIONS[collection] : undefined
  if (!dir) throw fail('pasta desconhecida', 404)
  return dir
}

function resolveSafe(dir: string, name: unknown): string {
  if (typeof name !== 'string' || !SAFE_NAME.test(name) || name.includes('..')) {
    throw fail('nome de arquivo inválido', 400)
  }
  const full = path.join(dir, name)
  // Cinto e suspensorio: mesmo com a regex, confere que o caminho final ficou dentro da pasta.
  if (path.dirname(full) !== dir) {
    throw fail('caminho fora da pasta de conteúdo', 400)
  }
  return full
}

const mtimeOf = async (full: string): Promise<number> => (await fs.stat(full)).mtimeMs

/** O mtime, ou `null` se o arquivo nao existe mais. */
async function mtimeIfExists(full: string): Promise<number | null> {
  try {
    return await mtimeOf(full)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/** `title` e o `meta.title` de dentro do arquivo — o que a tela mostra no lugar do nome. */
export type FileEntry = { name: string; mtime: number; size: number; title: string }

/**
 * O titulo de cada arquivo, lido de novo so quando o arquivo muda. A lista e pedida
 * a cada 3 segundos por cada tela aberta; reler todos os arquivos a cada pedido
 * seria trabalho jogado fora.
 */
const titles = new Map<string, { mtime: number; title: string }>()

async function titleOf(full: string, mtime: number): Promise<string> {
  const cached = titles.get(full)
  if (cached?.mtime === mtime) return cached.title
  let title = ''
  try {
    // "failsafe": o titulo volta como texto, do jeito que foi escrito.
    const doc = YAML.parse(await fs.readFile(full, 'utf8'), { schema: 'failsafe' }) as unknown
    const meta = typeof doc === 'object' && doc !== null ? (doc as Record<string, unknown>).meta : undefined
    const value = typeof meta === 'object' && meta !== null ? (meta as Record<string, unknown>).title : undefined
    if (typeof value === 'string') title = value.trim()
  } catch { /* yaml quebrado: fica sem titulo, e o editor mostra o erro ao abrir */ }
  titles.set(full, { mtime, title })
  return title
}

/**
 * Uma escrita por arquivo de cada vez. Conferir o mtime e gravar sao dois passos;
 * sem a fila, dois pedidos com o mesmo mtime de base passariam os dois pela
 * conferencia, e o primeiro seria sobrescrito sem ninguem saber.
 */
const queues = new Map<string, Promise<unknown>>()

function oneAtATime<T>(full: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(full) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(work)
  queues.set(full, next)
  void next.finally(() => { if (queues.get(full) === next) queues.delete(full) }).catch(() => undefined)
  return next
}

export async function listFiles(collection: string): Promise<{ dir: string; files: FileEntry[] }> {
  const dir = collectionDir(collection)
  await fs.mkdir(dir, { recursive: true })
  const names = await fs.readdir(dir)
  const files: FileEntry[] = []

  for (const name of names) {
    if (!SAFE_NAME.test(name)) continue
    const full = path.join(dir, name)
    const stat = await fs.stat(full)
    if (!stat.isFile()) continue
    files.push({ name, mtime: stat.mtimeMs, size: stat.size, title: await titleOf(full, stat.mtimeMs) })
  }

  files.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return { dir, files }
}

export async function readFile(collection: string, name: unknown): Promise<{ name: string; content: string; mtime: number }> {
  const full = resolveSafe(collectionDir(collection), name)
  const content = await fs.readFile(full, 'utf8')
  return { name: name as string, content, mtime: await mtimeOf(full) }
}

/**
 * Grava so se o arquivo no disco ainda estiver na versao que o editor abriu.
 * Se alguem mexeu no meio do caminho, devolve 409 e o navegador mostra a faixa de
 * conflito — em vez de apagar em silencio o trabalho do outro. Se o arquivo sumiu,
 * devolve 404 e o navegador pergunta o que fazer.
 *
 * `baseMtime` ausente significa "grava mesmo assim", usado quando a pessoa escolhe
 * explicitamente manter a versao da tela — inclusive recriando um arquivo que
 * sumiu do disco.
 */
export async function writeFile(
  collection: string,
  name: unknown,
  content: unknown,
  baseMtime: unknown,
): Promise<{ name: string; mtime: number }> {
  const full = resolveSafe(collectionDir(collection), name)
  if (typeof content !== 'string') throw fail('conteúdo ausente', 400)

  return oneAtATime(full, async () => {
    const force = typeof baseMtime !== 'number'
    const current = await mtimeIfExists(full)
    if (current === null && !force) throw fail('o arquivo não existe mais no disco', 404)
    // Tolerancia de 1ms: alguns sistemas de arquivo arredondam o mtime.
    if (current !== null && !force && Math.abs(current - baseMtime) > 1) {
      throw fail('o arquivo mudou no disco', 409, {
        conflict: true,
        mtime: current,
        content: await fs.readFile(full, 'utf8'),
      })
    }

    await fs.writeFile(full, content, 'utf8')
    return { name: name as string, mtime: await mtimeOf(full) }
  })
}

export async function createFile(collection: string, name: unknown, content: string): Promise<{ name: string; mtime: number }> {
  const dir = collectionDir(collection)
  const full = resolveSafe(dir, name)
  await fs.mkdir(dir, { recursive: true })
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

export async function deleteFile(collection: string, name: unknown): Promise<{ name: string }> {
  const full = resolveSafe(collectionDir(collection), name)
  await fs.unlink(full)
  return { name: name as string }
}
