/**
 * Testes da camada de modelo — a parte onde um erro custa conteudo perdido.
 *
 * Roda com `npm test`. Carrega os modulos TypeScript pelo proprio Vite
 * (`ssrLoadModule`), entao nao precisa de compilador nem de dependencia extra.
 */

import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let server
let parseDoc
let serializeDoc
let emptyDoc
let ops
let geometry

before(async () => {
  server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    server: { middlewareMode: true },
    logLevel: 'error',
  })
  ;({ parseDoc, emptyDoc } = await server.ssrLoadModule('/src/model/parse.ts'))
  ;({ serializeDoc } = await server.ssrLoadModule('/src/model/serialize.ts'))
  ops = await server.ssrLoadModule('/src/model/operations.ts')
  geometry = await server.ssrLoadModule('/src/model/geometry.ts')
})

after(async () => { await server?.close() })

/** `uid` so existe em memoria; comparacoes de modelo precisam ignora-lo. */
const strip = (doc) => JSON.parse(JSON.stringify(doc, (key, value) => (key === 'uid' ? undefined : value)))

const SAMPLE = `
meta:
  title: Etapa 1 — Fundação
entities:
  - name: Account
    label: Conta
    description: A unidade de isolamento.
    position: { x: 60, y: 80 }
    fields:
      - name: id
        type: int
        pk: true
        note: nunca exposto
      - name: name
        type: text
        required: true
  - name: User
    position: { x: 440, y: 40 }
    fields:
      - name: account_id
        type: int
        fk: true
relations:
  - from: Account
    fromField: id
    to: User
    toField: account_id
    kind: one-to-many
    note: uma conta tem vários usuários
notes:
  - text: |-
      Primeira linha

      Terceira linha, com acento: coração.
    anchor: Account
    position: { x: 60, y: 400 }
    width: 320
`

describe('parse', () => {
  it('lê entidades, campos, relações e notas', () => {
    const result = parseDoc(SAMPLE)
    assert.equal(result.ok, true)

    const { doc } = result
    assert.equal(doc.meta.title, 'Etapa 1 — Fundação')
    assert.deepEqual(doc.entities.map((e) => e.name), ['Account', 'User'])
    assert.equal(doc.entities[0].fields.length, 2)
    assert.equal(doc.entities[0].fields[0].pk, true)
    assert.equal(doc.entities[0].position.x, 60)
    assert.equal(doc.relations[0].kind, 'one-to-many')
    assert.equal(doc.notes.length, 1)
    assert.equal(doc.warnings.length, 0)
  })

  it('preserva quebra de linha e acento na nota', () => {
    const { doc } = parseDoc(SAMPLE)
    assert.match(doc.notes[0].text, /Primeira linha\n\nTerceira linha, com acento: coração\./)
  })

  it('devolve erro em vez de lançar exceção quando o yaml está quebrado', () => {
    const result = parseDoc('meta:\n  title: [sem fechar')
    assert.equal(result.ok, false)
    assert.ok(result.error.length > 0)
  })

  it('recusa arquivo que não é um mapa', () => {
    assert.equal(parseDoc('- só uma lista').ok, false)
  })

  it('aceita arquivo vazio', () => {
    const result = parseDoc('')
    assert.equal(result.ok, true)
    assert.equal(result.doc.entities.length, 0)
  })

  it('distribui em grade quem não tem posição, para nada nascer empilhado', () => {
    const { doc } = parseDoc('entities:\n  - name: A\n  - name: B\n  - name: C\n  - name: D\n')
    const seen = new Set(doc.entities.map((e) => `${e.position.x},${e.position.y}`))
    assert.equal(seen.size, 4)
  })

  it('aponta relação órfã como aviso sem apagar nada', () => {
    const { doc } = parseDoc('entities:\n  - name: A\nrelations:\n  - from: A\n    to: Fantasma\n    kind: one-to-many\n')
    assert.equal(doc.relations.length, 1)
    assert.equal(doc.warnings.length, 1)
    assert.match(doc.warnings[0], /Fantasma/)
  })

  it('cai para one-to-many quando a cardinalidade é desconhecida', () => {
    const { doc } = parseDoc('relations:\n  - from: A\n    to: B\n    kind: sei-la\n')
    assert.equal(doc.relations[0].kind, 'one-to-many')
  })
})

describe('ida e volta', () => {
  it('gravar e reabrir devolve o mesmo modelo', () => {
    const { doc } = parseDoc(SAMPLE)
    const written = serializeDoc(doc)
    const reopened = parseDoc(written)
    assert.equal(reopened.ok, true)
    assert.deepEqual(strip(reopened.doc), strip(doc))
  })

  it('gravar duas vezes gera bytes idênticos', () => {
    // Se a serialização oscilasse, o autosave sujaria o git sozinho a cada abertura.
    const { doc } = parseDoc(SAMPLE)
    const once = serializeDoc(doc)
    const twice = serializeDoc(parseDoc(once).doc)
    assert.equal(twice, once)
  })

  it('não escreve campo vazio', () => {
    const written = serializeDoc(parseDoc('entities:\n  - name: X\n    fields:\n      - name: y\n').doc)
    assert.ok(!written.includes('note:'))
    assert.ok(!written.includes('label:'))
    assert.ok(!written.includes('description:'))
  })

  it('mantém position em uma linha só', () => {
    const written = serializeDoc(parseDoc(SAMPLE).doc)
    assert.match(written, /position: \{ x: 60, y: 80 \}/)
  })

  it('não quebra linha longa em várias', () => {
    const longText = 'palavra '.repeat(40).trim()
    const doc = emptyDoc('t')
    doc.meta.description = longText
    assert.ok(serializeDoc(doc).includes(longText))
  })
})

describe('operações', () => {
  it('renomear entidade leva as relações junto', () => {
    const { doc } = parseDoc(SAMPLE)
    const account = doc.entities.find((e) => e.name === 'Account')
    const renamed = ops.withWarnings(ops.renameEntity(doc, account.uid, 'Tenant'))
    assert.equal(renamed.warnings.length, 0)
    assert.equal(renamed.relations[0].from, 'Tenant')
  })

  it('apagar entidade remove as relações dela', () => {
    const { doc } = parseDoc(SAMPLE)
    const account = doc.entities.find((e) => e.name === 'Account')
    const removed = ops.withWarnings(ops.deleteEntity(doc, account.uid))
    assert.equal(removed.entities.length, 1)
    assert.equal(removed.relations.length, 0)
    assert.equal(removed.warnings.length, 0)
  })

  it('ignora auto-relação e duplicata exata', () => {
    // Par repetido só é duplicata se os campos também baterem: duas FKs entre as
    // mesmas tabelas são legítimas (created_by e updated_by apontando para User.id).
    const { doc } = parseDoc(SAMPLE)
    assert.equal(ops.addRelation(doc, 'r9', 'Account', 'Account').relations.length, 1)
    assert.equal(ops.addRelation(doc, 'r9', 'Account', 'User', 'id', 'account_id').relations.length, 1)
    assert.equal(ops.addRelation(doc, 'r9', 'User', 'Account').relations.length, 2)
  })

  it('reordena campo por posição', () => {
    const { doc } = parseDoc(SAMPLE)
    const account = doc.entities.find((e) => e.name === 'Account')
    const moved = ops.moveField(doc, account.uid, 0, 1)
    assert.deepEqual(moved.entities[0].fields.map((f) => f.name), ['name', 'id'])
  })

  it('sugere nome livre para entidade nova', () => {
    const { doc } = parseDoc('entities:\n  - name: Entidade\n  - name: Entidade2\n')
    assert.equal(ops.suggestEntityName(doc), 'Entidade3')
  })
})

describe('onde a linha gruda', () => {
  it('lê e grava o campo de cada ponta da relação', () => {
    const { doc } = parseDoc(SAMPLE)
    assert.equal(doc.relations[0].fromField, 'id')
    assert.equal(doc.relations[0].toField, 'account_id')

    const written = serializeDoc(doc)
    assert.match(written, /fromField: id/)
    assert.match(written, /toField: account_id/)
  })

  it('não escreve o campo quando a linha gruda na caixa inteira', () => {
    const written = serializeDoc(parseDoc('relations:\n  - from: A\n    to: B\n    kind: one-to-one\n').doc)
    assert.ok(!written.includes('fromField'))
    assert.ok(!written.includes('toField'))
  })

  it('renomear um campo leva as linhas grudadas nele', () => {
    // Sem isto a linha voltaria calada para a borda da caixa.
    const { doc } = parseDoc(SAMPLE)
    const user = doc.entities.find((e) => e.name === 'User')
    const accountId = user.fields.find((f) => f.name === 'account_id')

    const renamed = ops.withWarnings(ops.updateField(doc, user.uid, accountId.uid, { name: 'conta_id' }))
    assert.equal(renamed.relations[0].toField, 'conta_id')
    assert.equal(renamed.warnings.length, 0)
  })

  it('renomear um campo não mexe em homônimo de outra entidade', () => {
    const { doc } = parseDoc(SAMPLE)
    const account = doc.entities.find((e) => e.name === 'Account')
    const id = account.fields.find((f) => f.name === 'id')

    // `User` também tem um campo `id`; só o lado `from` deve mudar.
    const renamed = ops.updateField(doc, account.uid, id.uid, { name: 'account_pk' })
    assert.equal(renamed.relations[0].fromField, 'account_pk')
    assert.equal(renamed.relations[0].toField, 'account_id')
  })

  it('apagar o campo solta a linha de volta para a borda', () => {
    const { doc } = parseDoc(SAMPLE)
    const user = doc.entities.find((e) => e.name === 'User')
    const accountId = user.fields.find((f) => f.name === 'account_id')

    const removed = ops.withWarnings(ops.deleteField(doc, user.uid, accountId.uid))
    assert.equal(removed.relations[0].toField, '')
    assert.equal(removed.relations.length, 1, 'a relação em si não pode sumir')
    assert.equal(removed.warnings.length, 0)
  })

  it('avisa quando a linha gruda num campo que não existe', () => {
    const { doc } = parseDoc(
      'entities:\n  - name: A\n    fields:\n      - name: x\n  - name: B\n' +
      'relations:\n  - from: A\n    fromField: fantasma\n    to: B\n    kind: one-to-many\n',
    )
    assert.equal(doc.warnings.length, 1)
    assert.match(doc.warnings[0], /fantasma/)
  })

  it('permite duas relações entre o mesmo par quando os campos diferem', () => {
    const { doc } = parseDoc(SAMPLE)
    const um = ops.addRelation(doc, 'r8', 'Account', 'User', 'name', 'name')
    assert.equal(um.relations.length, 2)
    // Mas o par idêntico continua sendo ignorado.
    const dois = ops.addRelation(um, 'r9', 'Account', 'User', 'name', 'name')
    assert.equal(dois.relations.length, 2)
  })

  it('escolhe o lado pela posição das caixas, e refaz quando elas se movem', () => {
    const direita = geometry.pickSides({ x: 0, y: 0 }, { x: 400, y: 0 })
    assert.deepEqual(direita, { source: 'right', target: 'left' })

    const esquerda = geometry.pickSides({ x: 400, y: 0 }, { x: 0, y: 0 })
    assert.deepEqual(esquerda, { source: 'left', target: 'right' })

    const abaixo = geometry.pickSides({ x: 0, y: 0 }, { x: 10, y: 400 })
    assert.deepEqual(abaixo, { source: 'bottom', target: 'top' })

    // Preso a uma linha da tabela, só lateral — cima e baixo não caberiam nos 21px.
    const naLinha = geometry.pickSides({ x: 0, y: 0 }, { x: 10, y: 400 }, true)
    assert.deepEqual(naLinha, { source: 'right', target: 'left' })
  })
})

describe('seta da nota', () => {
  it('lê e grava para qual entidade a nota aponta', () => {
    const { doc } = parseDoc(SAMPLE)
    assert.equal(doc.notes[0].anchor, 'Account')
    assert.match(serializeDoc(doc), /anchor: Account/)
  })

  it('não escreve anchor quando a nota está solta', () => {
    const written = serializeDoc(parseDoc('notes:\n  - text: solta\n').doc)
    assert.ok(!written.includes('anchor:'))
  })

  it('renomear entidade leva a seta junto', () => {
    const { doc } = parseDoc(SAMPLE)
    const account = doc.entities.find((e) => e.name === 'Account')
    const renamed = ops.withWarnings(ops.renameEntity(doc, account.uid, 'Tenant'))
    assert.equal(renamed.notes[0].anchor, 'Tenant')
    assert.equal(renamed.warnings.length, 0)
  })

  it('apagar a entidade solta a seta mas preserva o texto da nota', () => {
    // O texto continua valendo mesmo sem a caixa que ele explicava — apagar junto
    // seria perder conteúdo escrito à mão por causa de uma exclusão de tabela.
    const { doc } = parseDoc(SAMPLE)
    const account = doc.entities.find((e) => e.name === 'Account')
    const removed = ops.withWarnings(ops.deleteEntity(doc, account.uid))
    assert.equal(removed.notes.length, 1)
    assert.match(removed.notes[0].text, /Primeira linha/)
    assert.equal(removed.notes[0].anchor, '')
    assert.equal(removed.warnings.length, 0)
  })

  it('avisa quando a seta aponta para entidade que não existe', () => {
    const { doc } = parseDoc('entities:\n  - name: A\nnotes:\n  - text: t\n    anchor: Fantasma\n')
    assert.equal(doc.warnings.length, 1)
    assert.match(doc.warnings[0], /Fantasma/)
  })
})
