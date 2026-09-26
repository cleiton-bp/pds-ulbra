import YAML from 'yaml'
import type { Actor, AlternativeFlow, Extra, Link, Note, Position, Section, UseCase, UseCaseDoc } from '../types'
import { NOTE_DEFAULT_WIDTH, USE_CASE_DEFAULT_WIDTH } from './constants'
import { refText } from './refs'

/**
 * Escreve o estado do editor de volta no arquivo.
 *
 * Regra que vale para tudo aqui: campo vazio nao vai para o yaml. O diff do git
 * mostra so o que existe de verdade, em vez de dezenas de `description: ""`.
 */

type Plain = Record<string, unknown>

const round = (position: Position): Position => ({
  x: Math.round(position.x),
  y: Math.round(position.y),
})

/**
 * Devolve ao mapa as chaves que o editor nao conhece (ver `Extra`), depois das
 * dele. Chave conhecida ganha: o que foi editado na tela nunca e sobrescrito pelo
 * valor antigo guardado.
 */
function withExtra(out: Plain, extra: Extra): Plain {
  for (const [key, value] of Object.entries(extra)) {
    // `hasOwn` e `defineProperty`: chave chamada `constructor` ou `__proto__` e so
    // mais uma chave do arquivo, e nao algo herdado de Object.
    if (Object.prototype.hasOwnProperty.call(out, key)) continue
    Object.defineProperty(out, key, { value, enumerable: true, writable: true, configurable: true })
  }
  return out
}

/** Passo em branco e so a linha vazia que sobrou da digitacao — nao e passo. */
const cleanSteps = (steps: string[]): string[] =>
  steps.map((step) => step.trim()).filter(Boolean)

function cleanActor(actor: Actor): Plain {
  const out: Plain = {}
  if (actor.name) out.name = actor.name
  if (actor.kind !== 'person') out.kind = actor.kind
  if (actor.description) out.description = actor.description
  out.position = round(actor.position)
  return withExtra(out, actor.extra)
}

function cleanFlow(flow: AlternativeFlow): Plain | null {
  const steps = cleanSteps(flow.steps)
  const hasExtra = Object.keys(flow.extra).length > 0
  if (!flow.title && steps.length === 0 && !hasExtra) return null
  const out: Plain = {}
  if (flow.title) out.title = flow.title
  if (steps.length > 0) out.steps = steps
  return withExtra(out, flow.extra)
}

function cleanUseCase(useCase: UseCase): Plain {
  const out: Plain = {}
  // Sem espaco nas pontas: a leitura tira, e as ligacoes citam o codigo limpo.
  const id = useCase.id.trim()
  if (id) out.id = id
  if (useCase.name) out.name = useCase.name
  if (useCase.description) out.description = useCase.description
  if (Math.round(useCase.width) !== USE_CASE_DEFAULT_WIDTH) out.width = Math.round(useCase.width)
  out.position = round(useCase.position)

  // A especificacao vem na ordem em que se le: antes, durante, desvios, depois.
  if (useCase.preconditions) out.preconditions = useCase.preconditions
  const mainFlow = cleanSteps(useCase.mainFlow)
  if (mainFlow.length > 0) out.mainFlow = mainFlow
  const flows = useCase.alternativeFlows.map(cleanFlow).filter((flow): flow is Plain => flow !== null)
  if (flows.length > 0) out.alternativeFlows = flows
  if (useCase.postconditions) out.postconditions = useCase.postconditions
  return withExtra(out, useCase.extra)
}

function cleanLink(doc: UseCaseDoc, link: Link): Plain {
  // Tipo que o editor nao reconheceu volta como estava escrito — ver `Link.unknownKind`.
  const out: Plain = { from: refText(doc, link.from), to: refText(doc, link.to), kind: link.unknownKind || link.kind }
  if (link.note) out.note = link.note
  return withExtra(out, link.extra)
}

function cleanNote(doc: UseCaseDoc, note: Note): Plain {
  const out: Plain = { text: note.text }
  if (note.anchor) out.anchor = refText(doc, note.anchor)
  out.position = round(note.position)
  if (note.width && Math.round(note.width) !== NOTE_DEFAULT_WIDTH) out.width = Math.round(note.width)
  return withExtra(out, note.extra)
}

export function serializeDoc(doc: UseCaseDoc): string {
  const plain: Plain = {}

  const meta: Plain = {}
  if (doc.meta.title) meta.title = doc.meta.title
  if (doc.meta.system) meta.system = doc.meta.system
  if (doc.meta.description) meta.description = doc.meta.description
  withExtra(meta, doc.meta.extra)
  if (Object.keys(meta).length > 0) plain.meta = meta

  // Os itens que o editor nao entendeu voltam no fim da lista de onde vieram.
  const withStray = (section: Section, items: Plain[]): unknown[] => [...items, ...(doc.stray[section] ?? [])]

  plain.actors = withStray('actors', doc.actors.map(cleanActor))
  plain.useCases = withStray('useCases', doc.useCases.map(cleanUseCase))
  const links = withStray('links', doc.links.map((link) => cleanLink(doc, link)))
  if (links.length > 0) plain.links = links
  const notes = withStray('notes', doc.notes.map((note) => cleanNote(doc, note)))
  if (notes.length > 0) plain.notes = notes
  withExtra(plain, doc.extra)

  const ydoc = new YAML.Document(plain)

  // `position` em linha unica: ocupa 1 linha em vez de 3 e nao polui o diff a cada arrasto.
  YAML.visit(ydoc, {
    Pair(_, pair) {
      const key = pair.key
      const isPosition = YAML.isScalar(key) && key.value === 'position'
      if (isPosition && YAML.isMap(pair.value)) pair.value.flow = true
    },
  })

  // lineWidth 0 desliga a quebra automatica — descricao longa nao vira diff de 5 linhas.
  return ydoc.toString({ lineWidth: 0 })
}
