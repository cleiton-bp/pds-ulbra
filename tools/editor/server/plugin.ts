import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createFile, deleteFile, fail, listFiles, readFile, writeFile, type ApiError } from './files'

/** API de arquivos servida pelo proprio Vite — um comando so, uma porta so. */

const MAX_BODY = 5_000_000

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

/**
 * Le o corpo inteiro e so entao decodifica. Decodificar pedaco por pedaco partiria
 * um "ç" que caisse entre dois pacotes da rede — e o arquivo seria gravado com "�"
 * no lugar, sem erro nenhum.
 *
 * Corpo grande demais para de ser guardado, mas continua sendo lido ate o fim: so
 * assim a resposta 413 consegue chegar a quem mandou.
 */
function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size <= MAX_BODY) chunks.push(chunk)
    })
    req.on('end', () => {
      if (size > MAX_BODY) return reject(fail('corpo grande demais', 413))
      if (size === 0) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>)
      } catch {
        reject(fail('json inválido', 400))
      }
    })
    req.on('error', reject)
  })
}

// localhost, qualquer subdominio dele (pds.localhost), 127.0.0.1 e [::1] — todos
// apontam para esta maquina.
const LOCAL_HOST = /^(([a-z0-9-]+\.)*localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i

/**
 * A API grava arquivo no disco, entao so atende quem esta nesta maquina, pela
 * propria pagina do editor. Ela roda antes das protecoes do Vite (ver `configureServer`),
 * e por isso confere sozinha:
 * - `Host` local — um site de fora que aponte o proprio dominio para 127.0.0.1
 *   (DNS rebinding) chega com o dominio dele no cabecalho;
 * - `Origin`, quando vem, tambem local — pagina de outro site nao manda pedido
 *   em nome desta;
 * - corpo em JSON — formulario de outro site so consegue mandar texto simples,
 *   e JSON exige a pergunta previa do navegador, que esta API nunca libera.
 */
function refuse(req: IncomingMessage): { status: number; body: unknown } | null {
  const host = req.headers.host ?? ''
  if (!LOCAL_HOST.test(host)) {
    return { status: 403, body: { error: 'a API de arquivos só atende localhost' } }
  }
  // A origem tem de ser a propria pagina do editor — mesmo host e mesma porta. Outro
  // servidor local, em outra porta, e outro site.
  const origin = req.headers.origin
  if (origin && origin.replace(/^https?:\/\//, '').toLowerCase() !== host.toLowerCase()) {
    return { status: 403, body: { error: 'pedido de outra origem recusado' } }
  }
  // O tipo exato, e nao "contem": `text/plain; application/json` e texto simples,
  // que um formulario de outro site consegue mandar.
  const hasBody = req.method === 'POST' || req.method === 'PUT'
  const mediaType = (req.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase()
  if (hasBody && mediaType !== 'application/json') {
    return { status: 415, body: { error: 'o corpo precisa ser JSON' } }
  }
  return null
}

async function route(req: IncomingMessage, url: URL): Promise<{ status: number; body: unknown }> {
  const refused = refuse(req)
  if (refused) return refused

  if (url.pathname === '/api/files' && req.method === 'GET') {
    return { status: 200, body: await listFiles() }
  }

  if (url.pathname === '/api/file') {
    switch (req.method) {
      case 'GET':
        return { status: 200, body: await readFile(url.searchParams.get('name')) }
      case 'PUT': {
        const { name, content, baseMtime } = await readBody(req)
        return { status: 200, body: await writeFile(name, content, baseMtime) }
      }
      case 'POST': {
        const { name, content } = await readBody(req)
        return { status: 201, body: await createFile(name, typeof content === 'string' ? content : '') }
      }
      case 'DELETE':
        return { status: 200, body: await deleteFile(url.searchParams.get('name')) }
      default:
        return { status: 405, body: { error: 'método não suportado' } }
    }
  }

  return { status: 404, body: { error: 'rota não encontrada' } }
}

export function modelingApi(): Plugin {
  return {
    name: 'modeling-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (!url.pathname.startsWith('/api/')) return next()

        route(req, url)
          .then(({ status, body }) => send(res, status, body))
          .catch((err: ApiError & NodeJS.ErrnoException) => {
            const status = err.status ?? (err.code === 'ENOENT' ? 404 : 500)
            if (status >= 500) console.error('[modeling-api]', err)
            send(res, status, { error: err.message, ...(err.payload ?? {}) })
          })
      })
    },
  }
}
