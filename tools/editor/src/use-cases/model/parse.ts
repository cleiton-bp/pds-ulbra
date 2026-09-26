import YAML from 'yaml'
import type {
  Actor, AlternativeFlow, Extra, Link, LinkKind, Note, ParseResult, Position, Section, UseCase, UseCaseDoc,
} from '../types'
import {
  clampWidth, isActorKind, newUid, NOTE_DEFAULT_WIDTH, USE_CASE_DEFAULT_WIDTH,
} from './constants'
import { inferLinkKind, nextFreeId, refresh } from './operations'
import { elementType, resolveRef, targetOf } from './refs'

/**
 * Le o arquivo .yaml para o estado do editor.
 *
 * Tudo aqui e defensivo de proposito: o arquivo pode ter sido escrito a mao ou por
 * uma IA, entao campo faltando vira valor padrao em vez de quebrar a tela — e o
 * que o editor nao entende fica guardado para voltar ao arquivo. Gravar pelo
 * editor nunca apaga o que ele nao entende.
 *
 * O arquivo e lido de tres jeitos ao mesmo tempo, cada um para o que faz melhor:
 * - o texto de cada campo vem da leitura "failsafe", em que tudo e texto como
 *   estava escrito — senao `id: 1.10` viraria o numero 1.1 e `name: 007` viraria 7;
 * - numero (posicao, largura) vem da leitura normal, que conhece o tipo;
 * - chave desconhecida vem do no do yaml, e nao do valor convertido: e o no que
 *   devolve `1.10`, `True` e numero grande ao arquivo exatamente como estavam.
 */

/** O mesmo pedaco do arquivo nas tres leituras. */
type Value = { core: unknown; safe: unknown; node: unknown }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asRecord = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {})

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

const isEmpty = (value: Value): boolean => value.core === null || value.core === undefined

const isScalar = (value: Value): boolean => !isEmpty(value) && typeof value.core !== 'object'

export const KNOWN_KEYS = {
  doc: ['meta', 'actors', 'useCases', 'links', 'notes'],
  meta: ['title', 'system', 'description'],
  actor: ['name', 'kind', 'description', 'position'],
  useCase: ['id', 'name', 'description', 'width', 'position', 'preconditions', 'mainFlow', 'alternativeFlows', 'postconditions'],
  flow: ['title', 'steps'],
  link: ['from', 'to', 'kind', 'note'],
  note: ['text', 'anchor', 'position', 'width'],
} as const

/**
 * Os nomes com que um tipo de ligacao costuma ser escrito a mao — em ingles, no
 * plural, em portugues, com ou sem acento. Tudo cai no valor que o editor grava.
 * `Map`, e nao objeto: `kind: constructor` nao pode achar nada herdado de Object.
 */
const KIND_ALIASES = new Map<string, LinkKind>([
  ['association', 'association'], ['associacao', 'association'], ['associa', 'association'],
  ['include', 'include'], ['includes', 'include'], ['inclusao', 'include'], ['inclui', 'include'],
  ['extend', 'extend'], ['extends', 'extend'], ['extensao', 'extend'], ['estende', 'extend'],
  ['generalization', 'generalization'], ['generalizacao', 'generalization'],
  ['specialization', 'generalization'], ['especializacao', 'generalization'],
  ['inheritance', 'generalization'], ['heranca', 'generalization'],
])

const plain = (word: string): string =>
  word.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[«»<>]/g, '').trim().toLowerCase()

export const linkKindFrom = (word: string): LinkKind | null => KIND_ALIASES.get(plain(word)) ?? null

/** Os passos de leitura que dependem do documento — seguir um `*apelido` precisa dele. */
function reader(document: YAML.Document) {
  const resolve = (node: unknown): unknown => (YAML.isAlias(node) ? node.resolve(document) : node)

  const field = (owner: Value, key: string): Value => {
    const map = resolve(owner.node)
    return {
      core: asRecord(owner.core)[key],
      safe: asRecord(owner.safe)[key],
      node: YAML.isMap(map) ? resolve(map.get(key, true)) : undefined,
    }
  }

  /**
   * Os itens de uma lista. Um item solto no lugar da lista — `links:` com um mapa
   * so, `notes: um texto` — vira lista de um: e o que a pessoa quis dizer, e o
   * conteudo nao some. Item vazio (`-` sem nada) nao e item.
   */
  const items = (value: Value): Value[] => {
    if (isEmpty(value)) return []
    if (!Array.isArray(value.core)) return [value]
    const safe = asArray(value.safe)
    const seq = resolve(value.node)
    return value.core
      .map((core, index) => ({ core, safe: safe[index], node: YAML.isSeq(seq) ? resolve(seq.get(index, true)) : undefined }))
      .filter((item) => !isEmpty(item))
  }

  /** As chaves do mapa que o editor nao conhece, com o no do yaml — ver `Extra`. */
  const extras = (owner: Value, known: readonly string[]): Extra => {
    const extra: Extra = {}
    const map = resolve(owner.node)
    if (!YAML.isMap(map)) return extra
    for (const pair of map.items) {
      const key = YAML.isScalar(pair.key) ? String(pair.key.value) : String(pair.key)
      if (known.includes(key)) continue
      // `defineProperty`, e nao atribuicao: uma chave chamada `__proto__` vira chave.
      Object.defineProperty(extra, key, {
        value: resolve(pair.value) ?? null, enumerable: true, writable: true, configurable: true,
      })
    }
    return extra
  }

  /** O no do yaml de um valor, para guardar inteiro o que o editor nao entende. */
  const raw = (value: Value): unknown => resolve(value.node) ?? value.core

  return { field, items, extras, raw }
}

type Reader = ReturnType<typeof reader>

/** Texto como estava escrito. Lista vira uma linha por item; nulo vira vazio. */
function text(r: Reader, value: Value): string {
  if (isEmpty(value)) return ''
  if (Array.isArray(value.core)) return r.items(value).map((item) => text(r, item)).join('\n')
  if (typeof value.safe === 'string') return value.safe
  // Um mapa onde se esperava texto: vira o proprio yaml dele, e nao some.
  return YAML.stringify(value.core).trim()
}

function number(value: Value, fallback: number): number {
  const parsed = typeof value.core === 'string' || typeof value.core === 'bigint' ? Number(value.core) : value.core
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Lista de passos. Aceita a lista do yaml ou um bloco de texto com um passo por
 * linha — o jeito mais natural de escrever um fluxo a mao. Um passo e uma linha:
 * quebra de linha dentro de um item vira espaco, senao o painel, que edita um
 * passo por linha, partiria o passo em dois na primeira tecla.
 *
 * `- O relator: abre o widget` e um engano comum — o yaml le um mapa, por causa
 * dos dois-pontos. Volta a ser o passo que a pessoa escreveu.
 */
function steps(r: Reader, value: Value): string[] {
  let lines: string[]
  if (isRecord(value.core)) {
    lines = Object.keys(value.core).map((key) => `${key}: ${text(r, r.field(value, key))}`)
  } else if (typeof value.safe === 'string') {
    lines = value.safe.split('\n')
  } else {
    lines = r.items(value).map((item) => text(r, item).replace(/\s*\n\s*/g, ' '))
  }
  return lines.filter((line) => line.trim() !== '')
}

/**
 * Sem posicao no arquivo, cada coisa nasce num lugar que lembra um diagrama: os
 * atores numa coluna a esquerda, os casos de uso em duas colunas ao lado, as notas
 * numa coluna a direita. Nada nasce empilhado.
 */
const actorSlot = (index: number): Position => ({ x: 40, y: 60 + index * 150 })
const useCaseSlot = (index: number): Position => ({ x: 280 + (index % 2) * 250, y: 40 + Math.floor(index / 2) * 130 })
const noteSlot = (index: number): Position => ({ x: 840, y: 40 + index * 160 })

function position(r: Reader, value: Value, fallback: Position): Position {
  return { x: number(r.field(value, 'x'), fallback.x), y: number(r.field(value, 'y'), fallback.y) }
}

function parseActor(r: Reader, value: Value, index: number): Actor {
  // Aceita a forma curta `actors: [Relator, Administrador]`, util para rascunho.
  if (isScalar(value)) {
    return { uid: newUid('a'), name: text(r, value), kind: 'person', description: '', position: actorSlot(index), extra: {} }
  }
  const kind = text(r, r.field(value, 'kind'))
  const extra = r.extras(value, KNOWN_KEYS.actor)
  // Tipo de ator desconhecido fica guardado, para nao sumir ao gravar.
  if (kind && !isActorKind(kind)) extra.kind = r.raw(r.field(value, 'kind'))
  return {
    uid: newUid('a'),
    name: text(r, r.field(value, 'name')),
    kind: isActorKind(kind) ? kind : 'person',
    description: text(r, r.field(value, 'description')),
    position: position(r, r.field(value, 'position'), actorSlot(index)),
    extra,
  }
}

function parseFlow(r: Reader, value: Value): AlternativeFlow {
  if (isScalar(value)) return { uid: newUid('f'), title: text(r, value), steps: [], extra: {} }
  // Uma lista solta no lugar do fluxo: sao os passos dele, sem titulo.
  if (Array.isArray(value.core)) return { uid: newUid('f'), title: '', steps: steps(r, value), extra: {} }
  return {
    uid: newUid('f'),
    title: text(r, r.field(value, 'title')),
    steps: steps(r, r.field(value, 'steps')),
    extra: r.extras(value, KNOWN_KEYS.flow),
  }
}

function parseUseCase(r: Reader, value: Value, index: number): UseCase {
  // Aceita a forma curta `useCases: [Abrir relato, Acompanhar relato]`.
  if (isScalar(value)) {
    return {
      uid: newUid('u'), id: '', name: text(r, value), description: '', position: useCaseSlot(index),
      width: USE_CASE_DEFAULT_WIDTH, preconditions: '', postconditions: '', mainFlow: [], alternativeFlows: [], extra: {},
    }
  }
  return {
    uid: newUid('u'),
    id: text(r, r.field(value, 'id')).trim(),
    name: text(r, r.field(value, 'name')),
    description: text(r, r.field(value, 'description')),
    position: position(r, r.field(value, 'position'), useCaseSlot(index)),
    width: clampWidth(number(r.field(value, 'width'), USE_CASE_DEFAULT_WIDTH)),
    preconditions: text(r, r.field(value, 'preconditions')),
    postconditions: text(r, r.field(value, 'postconditions')),
    mainFlow: steps(r, r.field(value, 'mainFlow')),
    alternativeFlows: r.items(r.field(value, 'alternativeFlows')).map((flow) => parseFlow(r, flow)),
    extra: r.extras(value, KNOWN_KEYS.useCase),
  }
}

type Elements = Pick<UseCaseDoc, 'actors' | 'useCases'>

function parseLink(r: Reader, value: Value, elements: Elements): Link {
  const from = resolveRef(elements, text(r, r.field(value, 'from')))
  const to = resolveRef(elements, text(r, r.field(value, 'to')))
  const written = text(r, r.field(value, 'kind')).trim()
  const known = linkKindFrom(written)
  return {
    uid: newUid('l'),
    from,
    to,
    // Tipo faltando ou desconhecido sai das pontas, e nao de um padrao fixo:
    // `from: Administrador, to: Membro do time` so pode ser generalizacao.
    kind: known ?? inferLinkKind(
      elementType(elements, targetOf(elements, from)),
      elementType(elements, targetOf(elements, to)),
    ),
    unknownKind: known ? '' : written,
    note: text(r, r.field(value, 'note')),
    extra: r.extras(value, KNOWN_KEYS.link),
  }
}

function parseNote(r: Reader, value: Value, index: number, elements: Elements): Note {
  if (isScalar(value)) {
    return { uid: newUid('n'), text: text(r, value), position: noteSlot(index), width: NOTE_DEFAULT_WIDTH, anchor: null, extra: {} }
  }
  const anchor = text(r, r.field(value, 'anchor'))
  return {
    uid: newUid('n'),
    text: text(r, r.field(value, 'text')),
    position: position(r, r.field(value, 'position'), noteSlot(index)),
    width: number(r.field(value, 'width'), NOTE_DEFAULT_WIDTH),
    anchor: anchor.trim() ? resolveRef(elements, anchor) : null,
    extra: r.extras(value, KNOWN_KEYS.note),
  }
}

/**
 * Caso de uso sem codigo ganha o proximo livre, porque sem codigo nenhuma ligacao
 * consegue cita-lo. Fica de fora tudo o que o arquivo ja usa ou cita — dar a um
 * caso de uso novo o codigo que uma ligacao orfa citava ligaria os dois sem
 * ninguem pedir.
 */
function fillMissingIds(useCases: UseCase[], cited: string[]): UseCase[] {
  const taken = [...useCases.map((u) => u.id), ...cited]
  return useCases.map((useCase) => {
    if (useCase.id) return useCase
    const id = nextFreeId(taken)
    taken.push(id)
    return { ...useCase, id }
  })
}

export function parseDoc(source: string): ParseResult {
  const content = source ?? ''
  // `schema` explicito nas duas leituras: um `%YAML 1.1` no topo nao faz uma delas
  // ler `y:` como booleano e a outra nao — as duas arvores precisam ter o mesmo formato.
  const core = YAML.parseDocument(content, { schema: 'core', intAsBigInt: true })
  const firstError = core.errors[0]
  if (firstError) return { ok: false, error: firstError.message }

  let root: Value
  try {
    root = {
      core: core.toJS() ?? {},
      safe: YAML.parseDocument(content, { schema: 'failsafe' }).toJS() ?? {},
      node: core.contents,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  if (!isRecord(root.core)) {
    return { ok: false, error: 'o arquivo precisa começar com um mapa (meta:, actors: …)' }
  }

  const r = reader(core)
  const stray: Partial<Record<Section, unknown[]>> = {}
  /** Separa os itens que o editor entende dos que so voltam para o arquivo. */
  const section = (key: Section, understood: (item: Value) => boolean): Value[] => {
    const all = r.items(r.field(root, key))
    const kept = all.filter(understood)
    const rest = all.filter((item) => !understood(item)).map(r.raw)
    if (rest.length > 0) stray[key] = rest
    return kept
  }

  const shorthandOrMap = (item: Value): boolean => isScalar(item) || isRecord(item.core)
  const rawActors = section('actors', shorthandOrMap)
  const rawUseCases = section('useCases', shorthandOrMap)
  // Ligacao nao tem forma curta: texto solto ("Relator -> UC01") so volta para o arquivo.
  const rawLinks = section('links', (item) => isRecord(item.core))
  const rawNotes = section('notes', shorthandOrMap)

  const cited = [
    ...rawLinks.flatMap((link) => [text(r, r.field(link, 'from')), text(r, r.field(link, 'to'))]),
    ...rawNotes.map((note) => text(r, r.field(note, 'anchor'))),
  ].map((key) => key.trim())

  const actors = rawActors.map((actor, index) => parseActor(r, actor, index))
  const useCases = fillMissingIds(rawUseCases.map((useCase, index) => parseUseCase(r, useCase, index)), cited)
  const elements = { actors, useCases }

  const meta = r.field(root, 'meta')
  const extra = r.extras(root, KNOWN_KEYS.doc)
  // `meta` que nao e mapa fica guardado como estava, em vez de virar meta vazio.
  if (!isEmpty(meta) && !isRecord(meta.core)) extra.meta = r.raw(meta)

  // Os avisos saem do mesmo lugar que usamos depois de cada edicao — uma regra so.
  const doc: UseCaseDoc = refresh({
    meta: {
      title: text(r, r.field(meta, 'title')),
      system: text(r, r.field(meta, 'system')),
      description: text(r, r.field(meta, 'description')),
      extra: r.extras(meta, KNOWN_KEYS.meta),
    },
    actors,
    useCases,
    links: rawLinks.map((link) => parseLink(r, link, elements)),
    notes: rawNotes.map((note, index) => parseNote(r, note, index, elements)),
    extra,
    stray,
    warnings: [],
  })

  return { ok: true, doc }
}

export const emptyDoc = (title: string): UseCaseDoc => ({
  meta: { title, system: '', description: '', extra: {} },
  actors: [],
  useCases: [],
  links: [],
  notes: [],
  extra: {},
  stray: {},
  warnings: [],
})
