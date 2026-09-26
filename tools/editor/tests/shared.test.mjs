/**
 * Testes do que os ambientes dividem: as regras do servidor sobre qual pasta e
 * qual nome aceitar.
 *
 * Roda com `npm test`, carregando os modulos TypeScript pelo proprio Vite.
 */

import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let server
let files

before(async () => {
  server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    server: { middlewareMode: true },
    logLevel: 'error',
  })
  files = await server.ssrLoadModule('/server/files.ts')
})

after(async () => { await server?.close() })

describe('servidor: pasta e nome', () => {
  it('só abre as pastas de conteúdo', () => {
    // Uma pasta por ambiente, dentro de `database-models/`.
    for (const collection of ['modeling']) {
      const dir = files.collectionDir(collection)
      assert.equal(path.basename(dir), collection)
      assert.equal(path.basename(path.dirname(dir)), 'database-models')
    }
    for (const name of ['src', '..', 'files', 'database-models', 'constructor', '__proto__', 'toString']) {
      assert.throws(() => files.collectionDir(name), (err) => err.status === 404, name)
    }
  })

  it('recusa nome que sairia da pasta, sem tocar no disco', async () => {
    for (const name of ['../package.json', 'a/b.yaml', '.hidden.yaml', 'x.json', '', '..yaml', 42]) {
      await assert.rejects(files.readFile('modeling', name), (err) => err.status === 400, String(name))
    }
  })
})
