/**
 * Testes do que os dois ambientes dividem: comentario no yaml, endereco da tela e
 * as regras do servidor sobre qual pasta e qual nome aceitar.
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
let hasYamlComments
let parseHash
let routeHash
let files

before(async () => {
  server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    server: { middlewareMode: true },
    logLevel: 'error',
  })
  ;({ hasYamlComments } = await server.ssrLoadModule('/src/shared/yamlComments.ts'))
  ;({ parseHash, routeHash } = await server.ssrLoadModule('/src/shared/navigation.tsx'))
  files = await server.ssrLoadModule('/server/files.ts')
})

after(async () => { await server?.close() })

describe('comentário no arquivo', () => {
  it('percebe comentário no topo, no fim da linha e no meio da lista', () => {
    assert.equal(hasYamlComments('# topo\nactors: [Relator]\n'), true)
    assert.equal(hasYamlComments('actors: [Relator] # no fim da linha\n'), true)
    assert.equal(hasYamlComments('actors:\n  # no meio\n  - Relator\n'), true)
    assert.equal(hasYamlComments('meta:\n  title: T\n# no fim do arquivo\n'), true)
  })

  it('não confunde # dentro de texto com comentário', () => {
    assert.equal(hasYamlComments('actors: [Relator]\n'), false)
    // Sem espaco antes, o # e parte do texto; com espaco, o yaml le comentario.
    assert.equal(hasYamlComments('meta:\n  title: "Etapa #1"\n  description: cor#fff\n'), false)
    assert.equal(hasYamlComments('meta:\n  description: cor #fff\n'), true)
  })

  it('yaml quebrado responde que não — esse caso é barrado pelo erro de sintaxe', () => {
    assert.equal(hasYamlComments('meta:\n  title: [sem fechar # x\n'), false)
  })
})

describe('endereço da tela', () => {
  it('lê o ambiente e o arquivo do #', () => {
    assert.deepEqual(parseHash('#/modeling/07-media-attachments.yaml'), { env: 'modeling', file: '07-media-attachments.yaml' })
    assert.deepEqual(parseHash('#/use-cases'), { env: 'use-cases', file: null })
    assert.deepEqual(parseHash('#/'), { env: null, file: null })
    assert.deepEqual(parseHash(''), { env: null, file: null })
  })

  it('endereço desconhecido cai no início, em vez de abrir um editor qualquer', () => {
    assert.deepEqual(parseHash('#/outra-coisa/x.yaml'), { env: null, file: null })
  })

  it('ida e volta do endereço', () => {
    for (const route of [
      { env: null, file: null },
      { env: 'modeling', file: null },
      { env: 'use-cases', file: 'example.yaml' },
    ]) assert.deepEqual(parseHash(routeHash(route)), route)
  })
})

describe('servidor: pasta e nome', () => {
  it('só abre as duas pastas de conteúdo', () => {
    // Uma pasta por ambiente, as duas dentro de `database-models/`.
    for (const collection of ['modeling', 'use-cases']) {
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
      await assert.rejects(files.readFile('use-cases', name), (err) => err.status === 400, String(name))
    }
  })
})

describe('quando o arquivo foi mexido', () => {
  let whenLabel
  before(async () => { ({ whenLabel } = await server.ssrLoadModule('/src/shared/dates.ts')) })

  // 24 de setembro de 2026, 20h — a noite, quando o erro dos blocos de 24h aparecia.
  const now = new Date(2026, 8, 24, 20, 0).getTime()
  const at = (day, hour) => new Date(2026, 8, day, hour, 0).getTime()

  it('conta dias do calendário, e não blocos de 24 horas', () => {
    assert.equal(whenLabel(at(24, 6), now), 'hoje')
    assert.equal(whenLabel(at(23, 23), now), 'ontem')
    assert.equal(whenLabel(at(23, 6), now), 'ontem')
    assert.equal(whenLabel(at(21, 12), now), 'há 3 dias')
  })

  it('de uma semana para trás, mostra a data', () => {
    assert.match(whenLabel(at(10, 12), now), /^10 de set\.?$/)
    assert.match(whenLabel(new Date(2025, 11, 31).getTime(), now), /2025/)
  })
})

describe('endereço malformado', () => {
  it('um % sem par não quebra a tela: abre o ambiente sem arquivo', () => {
    assert.deepEqual(parseHash('#/modeling/%E0%A4%A'), { env: 'modeling', file: null })
  })
})
