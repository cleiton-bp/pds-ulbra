/**
 * Testes da camada de modelo — a parte onde um erro custa conteudo perdido.
 *
 * Roda com `npm test`. Carrega os modulos TypeScript pelo proprio Vite
 * (`ssrLoadModule`), entao nao precisa de compilador nem de dependencia extra.
 */

import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let server
let parseDoc
let emptyDoc
let serializeDoc
let ops
let analysis
let geometry
let refs

before(async () => {
  server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    server: { middlewareMode: true },
    logLevel: 'error',
  })
  ;({ parseDoc, emptyDoc } = await server.ssrLoadModule('/src/use-cases/model/parse.ts'))
  ;({ serializeDoc } = await server.ssrLoadModule('/src/use-cases/model/serialize.ts'))
  ops = await server.ssrLoadModule('/src/use-cases/model/operations.ts')
  analysis = await server.ssrLoadModule('/src/use-cases/model/analysis.ts')
  geometry = await server.ssrLoadModule('/src/use-cases/model/geometry.ts')
  refs = await server.ssrLoadModule('/src/use-cases/model/refs.ts')
})

after(async () => { await server?.close() })

/** `uid` so existe em memoria; comparacoes de modelo precisam ignora-lo. */
const strip = (doc) => JSON.parse(JSON.stringify(doc, (key, value) => (key === 'uid' ? undefined : value)))

/** Abre, e falha o teste se o yaml nao abrir. */
const open = (text) => {
  const result = parseDoc(text)
  assert.equal(result.ok, true, result.error)
  return result.doc
}

const actor = (doc, name) => doc.actors.find((a) => a.name === name)
const useCase = (doc, id) => doc.useCases.find((u) => u.id === id)

/** Os codigos que o ator realiza, na ordem do arquivo. */
const doneBy = (doc, name) => analysis.capabilitiesOf(doc, actor(doc, name).uid).map((c) => c.useCase.id)

const SAMPLE = `
meta:
  title: Relato — do envio ao acompanhamento
  system: PDS
actors:
  - name: Relator
    description: Quem encontrou o problema.
    position: { x: 40, y: 120 }
  - name: Membro do time
    position: { x: 800, y: 80 }
  - name: Administrador
    position: { x: 800, y: 320 }
useCases:
  - id: UC01
    name: Abrir relato
    position: { x: 260, y: 60 }
    preconditions: O widget está publicado.
    mainFlow:
      - Abre o widget.
      - Descreve o problema.
    alternativeFlows:
      - title: 2a. Sem descrição
        steps:
          - O formulário pede a descrição.
    postconditions: |-
      O relato existe.

      Quem relatou vê "Recebido", com acento: coração.
  - id: UC02
    name: Anexar print
    position: { x: 260, y: 200 }
  - id: UC03
    name: Mover relato
    position: { x: 520, y: 60 }
  - id: UC04
    name: Entrar com Google
    position: { x: 520, y: 200 }
  - id: UC05
    name: Configurar etapas
    width: 240
    position: { x: 520, y: 340 }
links:
  - from: Relator
    to: UC01
    kind: association
  - from: UC02
    to: UC01
    kind: extend
    note: quando o relator escolhe anexar
  - from: Membro do time
    to: UC03
    kind: association
  - from: UC03
    to: UC04
    kind: include
  - from: Administrador
    to: Membro do time
    kind: generalization
  - from: Administrador
    to: UC05
    kind: association
notes:
  - text: O relator não tem conta.
    anchor: Relator
    position: { x: 40, y: 400 }
`

describe('leitura', () => {
  it('lê atores, casos de uso, ligações e notas', () => {
    const doc = open(SAMPLE)
    assert.equal(doc.meta.title, 'Relato — do envio ao acompanhamento')
    assert.equal(doc.meta.system, 'PDS')
    assert.deepEqual(doc.actors.map((a) => a.name), ['Relator', 'Membro do time', 'Administrador'])
    assert.deepEqual(doc.useCases.map((u) => u.id), ['UC01', 'UC02', 'UC03', 'UC04', 'UC05'])
    assert.equal(doc.links.length, 6)
    assert.equal(doc.notes.length, 1)
    assert.deepEqual(doc.warnings, [])
  })

  it('lê a especificação do caso de uso', () => {
    const uc = useCase(open(SAMPLE), 'UC01')
    assert.equal(uc.preconditions, 'O widget está publicado.')
    assert.deepEqual(uc.mainFlow, ['Abre o widget.', 'Descreve o problema.'])
    assert.equal(uc.alternativeFlows[0].title, '2a. Sem descrição')
    assert.deepEqual(uc.alternativeFlows[0].steps, ['O formulário pede a descrição.'])
  })

  it('preserva quebra de linha e acento', () => {
    const uc = useCase(open(SAMPLE), 'UC01')
    assert.match(uc.postconditions, /O relato existe\.\n\nQuem relatou vê "Recebido", com acento: coração\./)
  })

  it('liga as pontas pelo nome do ator e pelo código do caso de uso', () => {
    const doc = open(SAMPLE)
    const first = doc.links[0]
    assert.equal(refs.targetOf(doc, first.from), actor(doc, 'Relator').uid)
    assert.equal(refs.targetOf(doc, first.to), useCase(doc, 'UC01').uid)
    assert.equal(refs.targetOf(doc, doc.notes[0].anchor), actor(doc, 'Relator').uid)
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
    const doc = open('')
    assert.equal(doc.actors.length, 0)
    assert.equal(doc.useCases.length, 0)
  })

  it('aceita a forma curta de rascunho, com nome solto', () => {
    const doc = open('actors: [Relator]\nuseCases: [Abrir relato, Acompanhar relato]\n')
    assert.equal(doc.actors[0].name, 'Relator')
    assert.deepEqual(doc.useCases.map((u) => [u.id, u.name]), [['UC01', 'Abrir relato'], ['UC02', 'Acompanhar relato']])
  })

  it('aceita fluxo escrito como bloco de texto, um passo por linha', () => {
    const doc = open('useCases:\n  - id: UC01\n    mainFlow: |\n      Abre o widget.\n\n      Envia.\n')
    assert.deepEqual(doc.useCases[0].mainFlow, ['Abre o widget.', 'Envia.'])
  })

  it('distribui quem não tem posição, para nada nascer empilhado', () => {
    const doc = open('actors: [A, B, C]\nuseCases: [x, y, z, w]\nnotes: [um, dois]\n')
    const all = [...doc.actors, ...doc.useCases, ...doc.notes].map((e) => `${e.position.x},${e.position.y}`)
    assert.equal(new Set(all).size, all.length)
  })

  it('dá código a caso de uso sem código, sem roubar o que uma ligação cita', () => {
    const doc = open('useCases:\n  - id: UC01\n  - name: Sem código\nlinks:\n  - { from: Relator, to: UC02 }\n')
    // UC02 ja e citado (e nao existe); dar esse codigo ligaria os dois sem ninguem pedir.
    assert.equal(doc.useCases[1].id, 'UC03')
  })

  it('tira o tipo da ligação das pontas quando o arquivo não diz', () => {
    const doc = open(`
actors: [Relator, Administrador, Membro]
useCases: [{ id: UC01 }, { id: UC02 }]
links:
  - { from: Relator, to: UC01 }
  - { from: Administrador, to: Membro }
  - { from: UC01, to: UC02, kind: nao-existe }
`)
    assert.deepEqual(doc.links.map((l) => l.kind), ['association', 'generalization', 'include'])
  })

  it('limita a largura da elipse a uma faixa legível', () => {
    const doc = open('useCases:\n  - { id: UC01, width: 5 }\n  - { id: UC02, width: 9000 }\n')
    assert.deepEqual(doc.useCases.map((u) => u.width), [150, 360])
  })
})

describe('ida e volta', () => {
  it('gravar e reabrir devolve o mesmo modelo', () => {
    const first = open(SAMPLE)
    const again = open(serializeDoc(first))
    assert.deepEqual(strip(again), strip(first))
  })

  it('gravar duas vezes gera bytes idênticos', () => {
    const once = serializeDoc(open(SAMPLE))
    const twice = serializeDoc(open(once))
    assert.equal(twice, once)
  })

  it('não escreve campo vazio', () => {
    const doc = ops.addActor(emptyDoc(''), 'a1', { x: 0, y: 0 })
    const text = serializeDoc(ops.addUseCase(doc, 'u1', { x: 100, y: 0 }))
    assert.doesNotMatch(text, /description|preconditions|mainFlow|alternativeFlows|postconditions|kind|width|""/)
  })

  it('não escreve passo em branco nem fluxo alternativo vazio', () => {
    let doc = ops.addUseCase(emptyDoc(''), 'u1', { x: 0, y: 0 })
    doc = ops.updateUseCase(doc, 'u1', { mainFlow: ['Abre o widget.', '', '  ', 'Envia.'] })
    doc = ops.addAlternativeFlow(doc, 'u1', 'f1')
    const text = serializeDoc(doc)
    assert.doesNotMatch(text, /alternativeFlows/)
    assert.deepEqual(open(text).useCases[0].mainFlow, ['Abre o widget.', 'Envia.'])
  })

  it('mantém position em uma linha só', () => {
    assert.match(serializeDoc(open(SAMPLE)), /position: \{ x: 40, y: 120 \}/)
  })

  it('não quebra linha longa em várias', () => {
    const long = 'palavra '.repeat(60).trim()
    const text = serializeDoc(open(`useCases:\n  - id: UC01\n    description: ${long}\n`))
    assert.ok(text.includes(`description: ${long}`))
  })

  it('só escreve o tipo do ator quando não é pessoa', () => {
    const text = serializeDoc(open('actors:\n  - name: Relator\n  - name: Google\n    kind: system\n'))
    assert.equal((text.match(/kind:/g) ?? []).length, 1)
    assert.match(text, /kind: system/)
  })

  it('grava de volta a referência que não existe, em vez de apagar', () => {
    const text = serializeDoc(open('links:\n  - { from: Fantasma, to: UC99, kind: association }\nnotes:\n  - { text: oi, anchor: Sumido }\n'))
    assert.match(text, /from: Fantasma/)
    assert.match(text, /to: UC99/)
    assert.match(text, /anchor: Sumido/)
  })

  it('abre todo arquivo da pasta sem aviso e sem perder nada', () => {
    // Os diagramas de verdade, e nao so o exemplo: um arquivo editado a mao que
    // passou a ter aviso aparece aqui, e nao no dia em que alguem for apresenta-lo.
    const dir = path.join(ROOT, 'database-models', 'use-cases')
    const names = fs.readdirSync(dir).filter((name) => name.endsWith('.yaml'))
    assert.ok(names.includes('example.yaml'))
    for (const name of names) {
      const doc = open(fs.readFileSync(path.join(dir, name), 'utf8'))
      assert.deepEqual(doc.warnings, [], name)
      assert.deepEqual(strip(open(serializeDoc(doc))), strip(doc), name)
    }
  })
})

describe('renomear', () => {
  it('trocar o nome do ator leva as ligações e a seta da nota junto', () => {
    const doc = open(SAMPLE)
    const renamed = ops.updateActor(doc, actor(doc, 'Relator').uid, { name: 'Quem relata' })
    const text = serializeDoc(renamed)
    assert.match(text, /from: Quem relata/)
    assert.match(text, /anchor: Quem relata/)
    assert.doesNotMatch(text, /Relator/)
  })

  it('trocar o código do caso de uso leva as ligações junto', () => {
    const doc = open(SAMPLE)
    const text = serializeDoc(ops.updateUseCase(doc, useCase(doc, 'UC04').uid, { id: 'UC40' }))
    assert.match(text, /to: UC40/)
    assert.doesNotMatch(text, /UC04/)
  })

  it('digitar um nome que passa pelo nome de outro ator não rouba as ligações dele', () => {
    // "Membro" a caminho de "Membro do time 2" passa, letra a letra, por "Membro do time".
    let doc = open(SAMPLE)
    doc = ops.addActor(doc, 'fresh', { x: 0, y: 0 })
    let typed = ''
    for (const letter of 'Membro do time 2') {
      typed += letter
      doc = ops.refresh(ops.updateActor(doc, 'fresh', { name: typed }))
    }
    assert.deepEqual(doneBy(doc, 'Membro do time'), ['UC03', 'UC04'])
    assert.deepEqual(analysis.capabilitiesOf(doc, 'fresh'), [])
  })

  it('referência órfã não se prende a quem passa pelo nome dela', () => {
    let doc = open('actors: [Ator]\nuseCases: [{ id: UC01 }]\nlinks:\n  - { from: Admin, to: UC01, kind: association }\n')
    const uid = actor(doc, 'Ator').uid
    let typed = ''
    for (const letter of 'Administrador') {
      typed += letter
      doc = ops.refresh(ops.updateActor(doc, uid, { name: typed }))
      if (typed === 'Admin') assert.deepEqual(doneBy(doc, 'Admin'), ['UC01'])
    }
    // Seguiu adiante: a ligacao volta a citar "Admin", como o arquivo dizia.
    assert.deepEqual(doneBy(doc, 'Administrador'), [])
    assert.match(serializeDoc(doc), /from: Admin\n/)
  })

  it('criar o elemento que uma ligação citava faz a linha aparecer', () => {
    let doc = open('actors: [Relator]\nlinks:\n  - { from: Relator, to: UC07, kind: association }\n')
    assert.equal(doc.warnings.length, 2) // cita quem nao existe, e o Relator nao faz nada
    doc = ops.refresh(ops.updateUseCase(ops.addUseCase(doc, 'u', { x: 300, y: 60 }), 'u', { id: 'UC07' }))
    assert.deepEqual(doneBy(doc, 'Relator'), ['UC07'])
    assert.deepEqual(doc.warnings, [])
  })
})

describe('apagar', () => {
  it('apagar o ator remove as ligações dele e solta a seta da nota', () => {
    const doc = open(SAMPLE)
    const after = ops.deleteActor(doc, actor(doc, 'Relator').uid)
    assert.equal(after.actors.length, 2)
    assert.equal(after.links.length, 5)
    assert.equal(after.notes[0].anchor, null)
    assert.equal(after.notes[0].text, 'O relator não tem conta.')
  })

  it('apagar o caso de uso remove as ligações dele', () => {
    const doc = open(SAMPLE)
    const after = ops.deleteUseCase(doc, useCase(doc, 'UC01').uid)
    // UC01 tinha duas: a associacao com o Relator e a extensao do UC02.
    assert.equal(after.links.length, 4)
  })
})

describe('ligações', () => {
  const base = () => open('actors: [Relator, Membro]\nuseCases: [{ id: UC01 }, { id: UC02 }]\n')

  it('escolhe o tipo pelas pontas ao puxar a linha', () => {
    let doc = base()
    const [reporter, member] = doc.actors.map((a) => a.uid)
    const [uc1, uc2] = doc.useCases.map((u) => u.uid)
    doc = ops.addLink(doc, 'l1', reporter, uc1)
    doc = ops.addLink(doc, 'l2', uc1, uc2)
    doc = ops.addLink(doc, 'l3', member, reporter)
    assert.deepEqual(doc.links.map((l) => l.kind), ['association', 'include', 'generalization'])
  })

  it('associação puxada do caso de uso para o ator grava o ator em from', () => {
    let doc = base()
    doc = ops.addLink(doc, 'l1', doc.useCases[0].uid, doc.actors[0].uid)
    assert.match(serializeDoc(doc), /from: Relator\n\s+to: UC01/)
  })

  it('ignora ligação consigo mesmo e repetição, nos dois sentidos da associação', () => {
    let doc = base()
    const [reporter] = doc.actors.map((a) => a.uid)
    const [uc1] = doc.useCases.map((u) => u.uid)
    doc = ops.addLink(doc, 'l1', reporter, uc1)
    doc = ops.addLink(doc, 'l2', reporter, uc1)
    doc = ops.addLink(doc, 'l3', uc1, reporter)
    doc = ops.addLink(doc, 'l4', uc1, uc1)
    assert.equal(doc.links.length, 1)
  })

  it('trocar a ponta por algo que não combina reescolhe o tipo', () => {
    let doc = base()
    const [uc1, uc2] = doc.useCases.map((u) => u.uid)
    doc = ops.addLink(doc, 'l1', uc1, uc2) // inclusao
    doc = ops.updateLink(doc, 'l1', { to: refs.bound(doc.actors[0].uid) })
    assert.equal(doc.links[0].kind, 'association')
    // e, sendo associacao, o ator vai para `from`
    assert.equal(refs.targetOf(doc, doc.links[0].from), doc.actors[0].uid)
  })

  it('inverte o sentido da inclusão, mas não o da associação', () => {
    let doc = base()
    const [reporter] = doc.actors.map((a) => a.uid)
    const [uc1, uc2] = doc.useCases.map((u) => u.uid)
    doc = ops.addLink(doc, 'inc', uc1, uc2)
    doc = ops.addLink(doc, 'assoc', reporter, uc1)
    doc = ops.reverseLink(ops.reverseLink(ops.reverseLink(doc, 'inc'), 'assoc'), 'assoc')
    const inc = doc.links.find((l) => l.uid === 'inc')
    const assoc = doc.links.find((l) => l.uid === 'assoc')
    assert.equal(refs.targetOf(doc, inc.from), uc2)
    assert.equal(refs.targetOf(doc, assoc.from), reporter)
  })

  it('lê cada ligação como frase', () => {
    const doc = open(SAMPLE)
    assert.deepEqual(doc.links.map((l) => analysis.linkSentence(doc, l)), [
      'Relator realiza UC01 — Abrir relato',
      'UC02 — Anexar print estende UC01 — Abrir relato',
      'Membro do time realiza UC03 — Mover relato',
      'UC03 — Mover relato inclui UC04 — Entrar com Google',
      'Administrador é um tipo de Membro do time',
      'Administrador realiza UC05 — Configurar etapas',
    ])
  })
})

describe('quem faz o quê', () => {
  it('o ator realiza o que está ligado a ele e o que isso arrasta junto', () => {
    const doc = open(SAMPLE)
    // UC02 estende UC01: quem abre relato pode anexar.
    assert.deepEqual(doneBy(doc, 'Relator'), ['UC01', 'UC02'])
    // UC03 inclui UC04: mover relato exige entrar.
    assert.deepEqual(doneBy(doc, 'Membro do time'), ['UC03', 'UC04'])
  })

  it('herda o que faz o ator de quem ele é um tipo', () => {
    const doc = open(SAMPLE)
    assert.deepEqual(doneBy(doc, 'Administrador'), ['UC03', 'UC04', 'UC05'])
    const caps = analysis.capabilitiesOf(doc, actor(doc, 'Administrador').uid)
    assert.deepEqual(caps.map((c) => c.via), ['inherited', 'include', 'direct'])
    assert.equal(analysis.viaLabel(doc, caps[0].via, caps[0].from), 'herda de Membro do time')
    assert.equal(analysis.viaLabel(doc, caps[1].via, caps[1].from), 'incluído por UC03')
  })

  it('a associação vale nos dois sentidos, mesmo escrita ao contrário à mão', () => {
    const doc = open('actors: [Relator]\nuseCases: [{ id: UC01 }]\nlinks:\n  - { from: UC01, to: Relator, kind: association }\n')
    assert.deepEqual(doneBy(doc, 'Relator'), ['UC01'])
  })

  it('a variação especializada vale para quem faz o caso geral', () => {
    const doc = open(`
actors: [Relator]
useCases: [{ id: UC01 }, { id: UC02 }]
links:
  - { from: Relator, to: UC01, kind: association }
  - { from: UC02, to: UC01, kind: generalization }
`)
    assert.deepEqual(doneBy(doc, 'Relator'), ['UC01', 'UC02'])
  })

  it('diz quem realiza cada caso de uso, e por qual caminho', () => {
    const doc = open(SAMPLE)
    const performers = analysis.performersOf(doc, useCase(doc, 'UC04').uid)
    assert.deepEqual(performers.map((p) => [p.actor.name, p.via]), [
      ['Membro do time', 'include'],
      ['Administrador', 'include'],
    ])
  })

  it('ligação circular não trava a busca', () => {
    const doc = open(`
actors: [A, B]
useCases: [{ id: UC01 }, { id: UC02 }]
links:
  - { from: A, to: B, kind: generalization }
  - { from: B, to: A, kind: generalization }
  - { from: B, to: UC01, kind: association }
  - { from: UC01, to: UC02, kind: include }
  - { from: UC02, to: UC01, kind: include }
`)
    assert.deepEqual(doneBy(doc, 'A'), ['UC01', 'UC02'])
  })

  it('o realce do ator acende ele, quem ele herda e o que ele faz', () => {
    const doc = open(SAMPLE)
    const admin = actor(doc, 'Administrador')
    const lit = analysis.focusOf(doc, { type: 'actor', uid: admin.uid })
    const names = [...doc.actors, ...doc.useCases].filter((e) => lit.has(e.uid)).map((e) => e.name)
    assert.deepEqual(names, ['Membro do time', 'Administrador', 'Mover relato', 'Entrar com Google', 'Configurar etapas'])
  })

  it('o realce do caso de uso acende quem o realiza e os vizinhos dele', () => {
    const doc = open(SAMPLE)
    const lit = analysis.focusOf(doc, { type: 'useCase', uid: useCase(doc, 'UC01').uid })
    const names = [...doc.actors, ...doc.useCases].filter((e) => lit.has(e.uid)).map((e) => e.name)
    assert.deepEqual(names, ['Relator', 'Abrir relato', 'Anexar print'])
  })

  it('sem escolha, ou com uma ligação escolhida, nada é realçado', () => {
    const doc = open(SAMPLE)
    assert.equal(analysis.focusOf(doc, null), null)
    assert.equal(analysis.focusOf(doc, { type: 'link', uid: doc.links[0].uid }), null)
  })
})

describe('avisos', () => {
  const warn = (text) => open(text).warnings

  it('aponta ligação para o que não existe, sem apagar nada', () => {
    const doc = open('actors: [Relator]\nlinks:\n  - { from: Relator, to: UC09, kind: association }\n')
    assert.ok(doc.warnings.some((w) => w.includes('cita "UC09", que não existe')))
    assert.equal(doc.links.length, 1)
  })

  it('aponta ligação sem uma das pontas', () => {
    assert.ok(warn('useCases: [{ id: UC01 }]\nlinks:\n  - { to: UC01, kind: include }\n')
      .some((w) => w.includes('está sem origem')))
  })

  it('aponta nome repetido, que deixa o arquivo ambíguo', () => {
    assert.ok(warn('actors: [Relator, Relator]\n').some((w) => w.startsWith('"Relator" identifica mais de um')))
    assert.ok(warn('actors: [UC01]\nuseCases: [{ id: UC01 }]\n').some((w) => w.startsWith('"UC01" identifica mais de um')))
  })

  it('aponta tipo que não combina com as pontas', () => {
    const warnings = warn(`
actors: [A, B]
useCases: [{ id: UC01 }, { id: UC02 }]
links:
  - { from: A, to: B, kind: association }
  - { from: A, to: UC01, kind: include }
  - { from: A, to: UC02, kind: generalization }
  - { from: UC01, to: UC02, kind: association }
`)
    assert.ok(warnings.includes('associação liga ator a caso de uso — A → B liga dois atores'))
    assert.ok(warnings.includes('«include» liga dois casos de uso — A → UC01 tem um ator na ponta'))
    assert.ok(warnings.includes('generalização liga dois atores ou dois casos de uso — A → UC02 mistura os dois'))
    assert.ok(warnings.includes('associação liga ator a caso de uso — UC01 → UC02 liga dois casos de uso'))
  })

  it('aponta inclusão e generalização em círculo, uma vez cada', () => {
    const warnings = warn(`
actors: [A, B]
useCases: [{ id: UC01 }, { id: UC02 }, { id: UC03 }]
links:
  - { from: A, to: UC01, kind: association }
  - { from: UC01, to: UC02, kind: include }
  - { from: UC02, to: UC03, kind: include }
  - { from: UC03, to: UC01, kind: include }
  - { from: A, to: B, kind: generalization }
  - { from: B, to: A, kind: generalization }
`)
    assert.deepEqual(warnings.filter((w) => w.includes('circular')), [
      'inclusão circular: UC01 → UC02 → UC03 → UC01',
      'generalização circular: A → B → A',
    ])
  })

  it('aponta caso de uso que nenhum ator alcança e ator que não faz nada', () => {
    const warnings = warn('actors: [Relator]\nuseCases: [{ id: UC01 }]\n')
    assert.ok(warnings.includes('UC01 — nenhum ator chega a este caso de uso'))
    assert.ok(warnings.includes('Relator não realiza nenhum caso de uso'))
  })

  it('não reclama do ator pai que só agrupa os filhos', () => {
    const warnings = warn(`
actors: [Usuário, Relator]
useCases: [{ id: UC01 }]
links:
  - { from: Relator, to: Usuário, kind: generalization }
  - { from: Relator, to: UC01, kind: association }
`)
    assert.deepEqual(warnings, [])
  })

  it('aponta nota com seta para o que não existe', () => {
    assert.ok(warn('notes:\n  - { text: oi, anchor: Sumido }\n').includes('nota aponta para "Sumido", que não existe'))
  })
})

describe('códigos', () => {
  it('sugere o próximo depois do maior, sem reaproveitar buraco', () => {
    assert.equal(ops.nextFreeId(['UC01', 'UC04']), 'UC05')
    assert.equal(ops.nextFreeId([]), 'UC01')
    assert.equal(ops.nextFreeId(['uc09', 'outro']), 'UC10')
  })

  it('caso de uso novo não pega o código que uma ligação órfã cita', () => {
    const doc = open('useCases: [{ id: UC01 }]\nlinks:\n  - { from: Relator, to: UC02, kind: association }\n')
    assert.equal(ops.addUseCase(doc, 'u', { x: 0, y: 0 }).useCases[1].id, 'UC03')
  })

  it('ator novo ganha nome livre', () => {
    let doc = emptyDoc('')
    doc = ops.addActor(ops.addActor(ops.addActor(doc, 'a', { x: 0, y: 0 }), 'b', { x: 0, y: 0 }), 'c', { x: 0, y: 0 })
    assert.deepEqual(doc.actors.map((a) => a.name), ['Ator', 'Ator 2', 'Ator 3'])
  })
})

describe('desenho', () => {
  const close = (actual, expected) => {
    assert.ok(Math.abs(actual.x - expected.x) < 1e-9 && Math.abs(actual.y - expected.y) < 1e-9,
      `${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`)
  }

  it('a linha para na borda da elipse, em qualquer ângulo', () => {
    const box = { x: 0, y: 0, width: 200, height: 80, shape: 'ellipse' }
    close(geometry.borderPoint(box, { x: 500, y: 40 }), { x: 200, y: 40 })
    close(geometry.borderPoint(box, { x: 100, y: -300 }), { x: 100, y: 0 })
    // Na diagonal o ponto cai sobre a curva: (x/a)² + (y/b)² = 1.
    const p = geometry.borderPoint(box, { x: 400, y: 340 })
    const onCurve = ((p.x - 100) / 100) ** 2 + ((p.y - 40) / 40) ** 2
    assert.ok(Math.abs(onCurve - 1) < 1e-9)
  })

  it('a linha para na borda do retângulo', () => {
    const box = { x: 0, y: 0, width: 40, height: 80, shape: 'rect' }
    close(geometry.borderPoint(box, { x: 220, y: 40 }), { x: 40, y: 40 })
    close(geometry.borderPoint(box, { x: 20, y: 500 }), { x: 20, y: 80 })
    close(geometry.borderPoint(box, { x: 120, y: 140 }), { x: 40, y: 60 })
  })

  it('centro em cima de centro não divide por zero', () => {
    const box = { x: 0, y: 0, width: 40, height: 40, shape: 'ellipse' }
    close(geometry.borderPoint(box, { x: 20, y: 20 }), { x: 20, y: 20 })
  })

  it('a fronteira envolve todos os casos de uso, com folga, e ignora os atores', () => {
    const doc = open(SAMPLE)
    const b = geometry.systemBounds(doc.useCases)
    for (const uc of doc.useCases) {
      assert.ok(uc.position.x > b.x && uc.position.x + uc.width < b.x + b.width)
      assert.ok(uc.position.y > b.y && uc.position.y + geometry.USE_CASE_HEIGHT < b.y + b.height)
    }
    const reporter = actor(doc, 'Relator')
    assert.ok(reporter.position.x < b.x)
    assert.equal(geometry.systemBounds([]), null)
  })

  it('elemento novo não nasce em cima de outro, e fica o mais perto possível', () => {
    const wanted = { x: 100, y: 100, width: 190, height: 84 }
    assert.deepEqual(geometry.freeSpot(wanted, []), { x: 100, y: 100 })
    const spot = geometry.freeSpot(wanted, [{ x: 100, y: 100, width: 190, height: 84 }])
    const overlaps = spot.x < 100 + 190 && 100 < spot.x + 190 && spot.y < 100 + 84 && 100 < spot.y + 84
    assert.equal(overlaps, false)
    assert.ok(Math.hypot(spot.x - 100, spot.y - 100) <= 32 * 4, `longe demais: ${JSON.stringify(spot)}`)
  })

  it('caixas centradas no mesmo ponto contam como em cima uma da outra', () => {
    // O boneco e a elipse centrados juntos tem cantos diferentes — e se cobrem.
    const ellipse = { x: 305, y: 358, width: 190, height: 84 }
    const actor = { x: 378, y: 364, width: 44, height: 108 }
    const spot = geometry.freeSpot(ellipse, [actor])
    assert.ok(spot.x + 190 <= actor.x || actor.x + actor.width <= spot.x
      || spot.y + 84 <= actor.y || actor.y + actor.height <= spot.y)
  })

  it('ator novo nasce fora da fronteira do sistema', () => {
    const doc = open(SAMPLE)
    const bounds = geometry.systemBounds(doc.useCases)
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
    const wanted = { x: center.x - 22, y: center.y - 54, width: 44, height: 108 }
    const spot = geometry.freeSpot(wanted, geometry.occupied(doc, { withBoundary: true }))
    const inside = spot.x + 44 > bounds.x && spot.x < bounds.x + bounds.width
      && spot.y + 108 > bounds.y && spot.y < bounds.y + bounds.height
    assert.equal(inside, false)
  })
})

describe('arquivo escrito à mão', () => {
  it('código e nome com cara de número continuam texto, como foram escritos', () => {
    const doc = open('actors:\n  - name: 007\nuseCases:\n  - id: 1.10\n  - id: 1.1\nlinks:\n  - { from: 007, to: 1.10, kind: association }\n')
    assert.deepEqual(doc.useCases.map((u) => u.id), ['1.10', '1.1'])
    assert.equal(doc.actors[0].name, '007')
    assert.deepEqual(doneBy(doc, '007'), ['1.10'])
    const again = open(serializeDoc(doc))
    assert.deepEqual(again.useCases.map((u) => u.id), ['1.10', '1.1'])
    assert.deepEqual(doneBy(again, '007'), ['1.10'])
  })

  it('nulo continua sendo vazio', () => {
    const doc = open('meta:\n  title: ~\n  system: null\nactors:\n  - name: Relator\n    description:\n')
    assert.equal(doc.meta.title, '')
    assert.equal(doc.meta.system, '')
    assert.equal(doc.actors[0].description, '')
  })

  it('guarda e grava de volta as chaves que o editor não conhece, e avisa', () => {
    const text = `
meta:
  title: T
  owner: grupo
actors:
  - name: Relator
    persona: externa
useCases:
  - id: UC01
    priority: 3
    alternativeFlows:
      - title: 2a
        trigger: sem texto
links:
  - { from: Relator, to: UC01, kind: association, weight: 2 }
notes:
  - { text: oi, color: amarela }
version: 2
`
    const doc = open(text)
    const saved = serializeDoc(doc)
    for (const line of ['owner: grupo', 'persona: externa', 'priority: 3', 'trigger: sem texto', 'weight: 2', 'color: amarela', 'version: 2']) {
      assert.ok(saved.includes(line), `sumiu ao gravar: ${line}\n${saved}`)
    }
    assert.deepEqual(strip(open(saved)), strip(doc))
    assert.ok(doc.warnings.includes('a chave "priority" em UC01 não faz parte do formato — fica no arquivo, mas o editor não a usa'))
    assert.ok(doc.warnings.includes('a chave "version" no topo do arquivo não faz parte do formato — fica no arquivo, mas o editor não a usa'))
  })

  it('o que foi editado na tela ganha da chave guardada', () => {
    const doc = open('actors:\n  - name: Google\n    kind: robo\n')
    assert.equal(doc.actors[0].kind, 'person')
    assert.match(serializeDoc(doc), /kind: robo/)
    assert.ok(doc.warnings.some((w) => w.includes('tem o tipo "robo"')))
    const chosen = ops.updateActor(doc, doc.actors[0].uid, { kind: 'system' })
    assert.match(serializeDoc(chosen), /kind: system/)
    assert.doesNotMatch(serializeDoc(chosen), /robo/)
  })

  it('entende o tipo da ligação escrito de outros jeitos', () => {
    const doc = open(`
useCases: [{ id: UC01 }, { id: UC02 }]
links:
  - { from: UC02, to: UC01, kind: extends }
  - { from: UC02, to: UC01, kind: extensão }
  - { from: UC01, to: UC02, kind: «include» }
  - { from: UC01, to: UC02, kind: Inclusão }
`)
    assert.deepEqual(doc.links.map((l) => l.kind), ['extend', 'extend', 'include', 'include'])
    assert.ok(doc.links.every((l) => l.unknownKind === ''))
  })

  it('tipo desconhecido volta para o arquivo como estava, até alguém escolher outro', () => {
    const doc = open('useCases: [{ id: UC01 }, { id: UC02 }]\nlinks:\n  - { from: UC01, to: UC02, kind: depende de }\n')
    assert.equal(doc.links[0].unknownKind, 'depende de')
    assert.match(serializeDoc(doc), /kind: depende de/)
    assert.ok(doc.warnings.some((w) => w.includes('tem o tipo "depende de", que o editor não conhece')))
    const chosen = ops.updateLink(doc, doc.links[0].uid, { kind: 'extend' })
    assert.match(serializeDoc(chosen), /kind: extend/)
    assert.equal(ops.refresh(chosen).warnings.some((w) => w.includes('depende de')), false)
  })

  it('passo com quebra de linha dentro vira uma linha só', () => {
    const doc = open('useCases:\n  - id: UC01\n    mainFlow:\n      - |-\n        Abre o widget\n        e escreve\n      - Envia\n')
    assert.deepEqual(doc.useCases[0].mainFlow, ['Abre o widget e escreve', 'Envia'])
  })

  it('o próximo código segue os dígitos do arquivo', () => {
    assert.equal(ops.nextFreeId(['UC001', 'UC007']), 'UC008')
    assert.equal(ops.nextFreeId(['UC9']), 'UC10')
  })
})

describe('avisos novos', () => {
  const warn = (text) => open(text).warnings

  it('aponta ligação repetida, nos dois sentidos da associação', () => {
    const warnings = warn(`
actors: [Relator]
useCases: [{ id: UC01 }]
links:
  - { from: Relator, to: UC01, kind: association }
  - { from: UC01, to: Relator, kind: association }
`)
    assert.ok(warnings.includes('a ligação UC01 → Relator aparece duas vezes'))
  })

  it('não reclama do caso de uso geral que só existe pelas variações', () => {
    const warnings = warn(`
actors: [Cliente]
useCases: [{ id: UC01, name: Pagar }, { id: UC02, name: Pagar com Pix }]
links:
  - { from: Cliente, to: UC02, kind: association }
  - { from: UC02, to: UC01, kind: generalization }
`)
    assert.deepEqual(warnings, [])
  })

  it('aponta ator desenhado dentro da fronteira do sistema', () => {
    const warnings = warn(`
actors:
  - { name: Relator, position: { x: 300, y: 300 } }
useCases:
  - { id: UC01, position: { x: 100, y: 100 } }
  - { id: UC02, position: { x: 500, y: 500 } }
links:
  - { from: Relator, to: UC01, kind: association }
  - { from: Relator, to: UC02, kind: association }
`)
    assert.deepEqual(warnings, ['Relator está dentro da fronteira do sistema — ator fica do lado de fora'])
  })

  it('sistema externo participa, e não realiza', () => {
    const doc = open(`
actors:
  - { name: Banco, kind: system }
  - { name: Parado, kind: system }
useCases: [{ id: UC01, name: Pagar }]
links:
  - { from: Banco, to: UC01, kind: association }
`)
    assert.equal(analysis.linkSentence(doc, doc.links[0]), 'Banco participa de UC01 — Pagar')
    assert.ok(doc.warnings.includes('Parado não participa de nenhum caso de uso'))
  })

  it('quem realiza fala do ponto de vista do ator', () => {
    const doc = open(SAMPLE)
    const performers = analysis.performersOf(doc, useCase(doc, 'UC04').uid)
    assert.deepEqual(performers.map((p) => analysis.performerViaLabel(doc, p.via, p.from)), ['ao fazer UC03', 'ao fazer UC03'])
    const admin = analysis.performersOf(doc, useCase(doc, 'UC03').uid).find((p) => p.actor.name === 'Administrador')
    assert.equal(analysis.performerViaLabel(doc, admin.via, admin.from), 'como Membro do time')
  })
})

describe('releitura do mesmo arquivo', () => {
  it('quem continua no arquivo mantém o uid, e as pontas acompanham', () => {
    const before = open(SAMPLE)
    // Alguem mexeu por fora: trocou uma descricao e acrescentou um ator.
    const edited = SAMPLE.replace('description: Quem encontrou o problema.', 'description: Quem achou.')
      .replace('actors:\n', 'actors:\n  - name: Novo\n')
    const after = ops.carryUids(before, open(edited))
    assert.equal(actor(after, 'Relator').uid, actor(before, 'Relator').uid)
    assert.equal(useCase(after, 'UC03').uid, useCase(before, 'UC03').uid)
    assert.equal(after.links[0].uid, before.links[0].uid)
    assert.equal(after.notes[0].uid, before.notes[0].uid)
    assert.equal(useCase(after, 'UC01').alternativeFlows[0].uid, useCase(before, 'UC01').alternativeFlows[0].uid)
    // O novo ganha uid proprio, e as ligacoes continuam chegando nos mesmos elementos.
    assert.ok(![...before.actors].some((a) => a.uid === actor(after, 'Novo').uid))
    assert.deepEqual(doneBy(after, 'Administrador'), ['UC03', 'UC04', 'UC05'])
    assert.equal(refs.targetOf(after, after.notes[0].anchor), actor(after, 'Relator').uid)
  })

  it('quem mudou de nome por fora conta como novo', () => {
    const before = open(SAMPLE)
    const after = ops.carryUids(before, open(SAMPLE.replace('name: Relator', 'name: Quem relata').replace('from: Relator', 'from: Quem relata').replace('anchor: Relator', 'anchor: Quem relata')))
    assert.notEqual(actor(after, 'Quem relata').uid, actor(before, 'Relator').uid)
    assert.deepEqual(doneBy(after, 'Quem relata'), ['UC01', 'UC02'])
  })
})

describe('o que o editor não entende volta para o arquivo', () => {
  /** Abre, grava, abre de novo e grava de novo: o segundo texto tem de ser igual ao primeiro. */
  const twice = (text) => {
    const once = serializeDoc(open(text))
    return { once, again: serializeDoc(open(once)) }
  }

  it('seção com um item só, sem ser lista, vira lista de um — e não some', () => {
    const doc = open(`
actors: Relator
useCases:
  id: UC01
  name: Abrir relato
  alternativeFlows: 2a. Sem descrição
links:
  from: Relator
  to: UC01
notes: O relator não tem conta
`)
    assert.deepEqual(doc.actors.map((a) => a.name), ['Relator'])
    assert.deepEqual(doc.useCases.map((u) => u.id), ['UC01'])
    assert.equal(doc.useCases[0].alternativeFlows[0].title, '2a. Sem descrição')
    assert.equal(doc.links.length, 1)
    assert.deepEqual(doneBy(doc, 'Relator'), ['UC01'])
    assert.equal(doc.notes[0].text, 'O relator não tem conta')
  })

  it('passo escrito com dois-pontos continua sendo o passo que a pessoa escreveu', () => {
    const doc = open('useCases:\n  - id: UC01\n    mainFlow:\n      - O relator: abre o widget\n      - Envia\n  - id: UC02\n    mainFlow: { Abre: o widget }\n')
    assert.deepEqual(doc.useCases[0].mainFlow, ['O relator: abre o widget', 'Envia'])
    assert.deepEqual(doc.useCases[1].mainFlow, ['Abre: o widget'])
  })

  it('valor de chave desconhecida volta exatamente como estava escrito', () => {
    const { once, again } = twice(`
actors:
  - name: Relator
    version: 1.10
    one: 1.0
    nul: Null
    t: True
    big: 12345678901234567890
    text: plain
`)
    for (const line of ['version: 1.10', 'one: 1.0', 'nul: Null', 't: True', 'big: 12345678901234567890', 'text: plain']) {
      assert.ok(once.includes(line), `mudou ao gravar: ${line}\n${once}`)
    }
    assert.equal(again, once)
  })

  it('chave com nome de coisa do JavaScript é só mais uma chave', () => {
    const { once, again } = twice(`
actors:
  - name: Relator
    constructor: foo
    toString: bar
    hasOwnProperty: baz
    __proto__: { x: 1 }
`)
    for (const line of ['constructor: foo', 'toString: bar', 'hasOwnProperty: baz', '__proto__:']) {
      assert.ok(once.includes(line), `sumiu ao gravar: ${line}\n${once}`)
    }
    assert.equal(again, once)
  })

  it('tipo de ligação com nome de coisa do JavaScript não quebra a gravação', () => {
    for (const kind of ['constructor', '__proto__', 'toString']) {
      const doc = open(`useCases: [{ id: UC01 }, { id: UC02 }]\nlinks:\n  - { from: UC01, to: UC02, kind: ${kind} }\n`)
      assert.equal(doc.links[0].kind, 'include')
      assert.equal(doc.links[0].unknownKind, kind)
      assert.ok(doc.warnings.every((w) => typeof w === 'string'))
      assert.match(serializeDoc(doc), new RegExp(`kind: ${kind.replace(/_/g, '_')}`))
    }
  })

  it('%YAML 1.1 no topo não embaralha a leitura', () => {
    const doc = open('%YAML 1.1\n---\nactors:\n  - name: Relator\n    position: { x: 110, y: 250 }\n')
    assert.deepEqual(doc.actors[0].position, { x: 110, y: 250 })
  })

  it('apelido do yaml (*base) é lido e a gravação não quebra', () => {
    const { once } = twice(`
useCases:
  - &base { id: UC01, description: "Nota: importante" }
  - { id: UC02, extra: *base }
`)
    assert.match(once, /description: "Nota: importante"|description: 'Nota: importante'/)
    assert.doesNotMatch(once, /'"Nota/)
  })

  it('ligação escrita como texto solto fica guardada e vira aviso', () => {
    const doc = open('actors: [Relator]\nuseCases: [{ id: UC01 }]\nlinks:\n  - Relator -> UC01\n  - { from: Relator, to: UC01, kind: association }\n  -\n')
    assert.equal(doc.links.length, 1)
    assert.ok(doc.warnings.some((w) => w.includes('1 item de links sem o formato de ligação')))
    const text = serializeDoc(doc)
    assert.match(text, /- Relator -> UC01/)
    assert.equal((text.match(/from:/g) ?? []).length, 1)
  })

  it('meta que não é mapa fica guardado', () => {
    const doc = open('meta: só um título\nactors: [Relator]\n')
    assert.match(serializeDoc(doc), /meta: só um título/)
    assert.ok(doc.warnings.some((w) => w.startsWith('"meta" não está no formato')))
  })

  it('código com espaço nas pontas é gravado limpo, e as ligações também', () => {
    let doc = open('actors: [Relator]\nuseCases: [{ id: UC01 }]\nlinks:\n  - { from: Relator, to: UC01, kind: association }\n')
    doc = ops.updateUseCase(doc, doc.useCases[0].uid, { id: 'UC01 ' })
    const { once, again } = { once: serializeDoc(doc), again: serializeDoc(open(serializeDoc(doc))) }
    assert.match(once, /id: UC01\n/)
    assert.match(once, /to: UC01\n/)
    assert.equal(again, once)
  })

  it('numeração de um dígito continua com um dígito', () => {
    assert.equal(ops.nextFreeId(['UC1', 'UC2']), 'UC3')
    assert.equal(ops.nextFreeId(['UC01']), 'UC02')
  })

  it('o que o caso de uso geral inclui também é alcançado por quem faz as variações', () => {
    const doc = open(`
actors: [Cliente]
useCases: [{ id: UC01, name: Pagar }, { id: UC02, name: Pagar com Pix }, { id: UC03, name: Validar }, { id: UC04, name: Cupom }]
links:
  - { from: Cliente, to: UC02, kind: association }
  - { from: UC02, to: UC01, kind: generalization }
  - { from: UC01, to: UC03, kind: include }
  - { from: UC04, to: UC01, kind: extend }
`)
    assert.deepEqual(doc.warnings, [])
  })
})
