import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createFile, deleteFile, listFiles, readFile, writeFile, type ApiError } from './files'

/** API de arquivos servida pelo proprio Vite — um comando so, uma porta so. */

const MAX_BODY = 5_000_000

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => {
      raw += chunk
      // Um arquivo de modelagem nao chega perto disso; o limite so evita um corpo infinito.
      if (raw.length > MAX_BODY) {
        reject(Object.assign(new Error('corpo grande demais'), { status: 413 }))
      }
    })
    req.on('end', () => {
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>)
      } catch {
        reject(Object.assign(new Error('json inválido'), { status: 400 }))
      }
    })
    req.on('error', reject)
  })
}

async function route(req: IncomingMessage, url: URL): Promise<{ status: number; body: unknown }> {
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
