import type { Extra, Link, LinkKind, Section, UseCaseDoc } from '../types'
import { capabilitiesOf, carriedFrom, parentActors, performVerb } from './analysis'
import { linkKind } from './constants'
import { ACTOR_SIZE, systemBounds } from './geometry'
import { elementKey, elementType, findElement, refText, targetOf } from './refs'

/**
 * Os avisos do painel. Nenhum impede a edicao e nenhum apaga nada: referencia
 * quebrada vira aviso, nunca exclusao silenciosa.
 *
 * Vem em duas levas. Primeiro o que deixa o arquivo ambiguo ou quebrado — nome
 * repetido, ligacao para quem nao existe, tipo que nao combina com as pontas.
 * Depois o que o desenho diz e provavelmente nao queria dizer — caso de uso que
 * nenhum ator alcanca, ator que nao faz nada.
 */
export function collectWarnings(doc: UseCaseDoc): string[] {
  const warnings = [
    ...namingWarnings(doc),
    ...extraWarnings(doc),
    ...doc.links.flatMap((link) => linkWarnings(doc, link)),
    ...duplicateWarnings(doc),
    ...cycleWarnings(doc, 'include'),
    ...cycleWarnings(doc, 'generalization'),
    ...noteWarnings(doc),
    ...boundaryWarnings(doc),
    ...coverageWarnings(doc),
  ]
  // O texto e a chave da lista na tela; dois avisos iguais seriam so ruido.
  return [...new Set(warnings)]
}

/** Nome do elemento como o arquivo o cita — curto, para caber na frase do aviso. */
const keyOf = (doc: UseCaseDoc, uid: string): string => {
  const element = findElement(doc, uid)
  return element ? elementKey(element) || '?' : '?'
}

function namingWarnings(doc: UseCaseDoc): string[] {
  const warnings: string[] = []

  // Ator e caso de uso dividem o mesmo espaco de nomes: `from: X` nao diz qual dos dois e.
  const count = new Map<string, number>()
  const keys = [...doc.actors.map((a) => a.name.trim()), ...doc.useCases.map((u) => u.id.trim())]
  for (const key of keys.filter(Boolean)) count.set(key, (count.get(key) ?? 0) + 1)
  for (const [key, times] of count) {
    if (times > 1) {
      warnings.push(`"${key}" identifica mais de um elemento — no arquivo, as ligações para ele ficam ambíguas`)
    }
  }

  for (const actor of doc.actors) {
    if (!actor.name.trim()) warnings.push('um ator está sem nome — nenhuma ligação consegue citá-lo no arquivo')
  }
  for (const useCase of doc.useCases) {
    if (!useCase.id.trim()) {
      warnings.push(`o caso de uso "${useCase.name || 'sem nome'}" está sem código — nenhuma ligação consegue citá-lo no arquivo`)
    }
  }

  return warnings
}

const pairOf = (doc: UseCaseDoc, link: Link): string =>
  `${refText(doc, link.from) || '?'} → ${refText(doc, link.to) || '?'}`

/**
 * Chave que o editor nao conhece fica no arquivo (ver `Extra`), mas quase sempre e
 * nome digitado errado — `descripton`, `usecases` — e o conteudo dela nao aparece
 * na tela. O aviso e o que faz alguem perceber.
 */
function extraWarnings(doc: UseCaseDoc): string[] {
  const warnings: string[] = []
  const report = (extra: Extra, where: string): void => {
    for (const key of Object.keys(extra)) {
      warnings.push(`a chave "${key}" ${where} não faz parte do formato — fica no arquivo, mas o editor não a usa`)
    }
  }

  const { meta, ...topLevel } = doc.extra
  if (meta !== undefined) {
    warnings.push('"meta" não está no formato (title, system, description) — fica no arquivo como estava, mas o editor não o usa')
  }
  report(topLevel, 'no topo do arquivo')
  report(doc.meta.extra, 'em meta')
  for (const actor of doc.actors) {
    const { kind, ...rest } = actor.extra
    if (kind !== undefined) {
      warnings.push(`o ator ${actor.name || 'sem nome'} tem o tipo "${String(kind)}", que o editor não conhece — aparece como pessoa`)
    }
    report(rest, `no ator ${actor.name || 'sem nome'}`)
  }
  for (const useCase of doc.useCases) {
    const name = useCase.id || useCase.name || 'caso de uso sem código'
    report(useCase.extra, `em ${name}`)
    for (const flow of useCase.alternativeFlows) report(flow.extra, `num fluxo alternativo de ${name}`)
  }
  for (const link of doc.links) report(link.extra, `na ligação ${pairOf(doc, link)}`)
  for (const note of doc.notes) report(note.extra, 'numa nota')

  const SECTION_LABEL: Record<Section, string> = {
    actors: 'actors', useCases: 'useCases', links: 'links', notes: 'notes',
  }
  const SHAPE: Record<Section, string> = {
    actors: 'de ator', useCases: 'de caso de uso', links: 'de ligação (from, to, kind)', notes: 'de nota',
  }
  for (const [section, items] of Object.entries(doc.stray) as Array<[Section, unknown[]]>) {
    if (!items?.length) continue
    warnings.push(`${items.length} ${items.length === 1 ? 'item' : 'itens'} de ${SECTION_LABEL[section]} sem o formato ${SHAPE[section]} — ${items.length === 1 ? 'fica' : 'ficam'} no arquivo como estava, mas não aparece no desenho`)
  }

  return warnings
}

function linkWarnings(doc: UseCaseDoc, link: Link): string[] {
  const pair = pairOf(doc, link)

  const from = targetOf(doc, link.from)
  const to = targetOf(doc, link.to)

  const broken: string[] = []
  for (const [end, ref, target] of [['origem', link.from, from], ['destino', link.to, to]] as const) {
    if (target) continue
    const text = 'missing' in ref ? ref.missing : ''
    broken.push(text.trim()
      ? `ligação ${pair} cita "${text}", que não existe`
      : `a ligação ${pair} está sem ${end}`)
  }
  if (broken.length > 0) return broken

  const fromType = elementType(doc, from)
  const toType = elementType(doc, to)
  if (!fromType || !toType) return []

  if (from === to) return [`${keyOf(doc, from)} está ligado a si mesmo`]

  if (link.unknownKind) {
    return [`a ligação ${pair} tem o tipo "${link.unknownKind}", que o editor não conhece — aparece como ${linkKind(link.kind).label} até alguém escolher o tipo no painel`]
  }

  switch (link.kind) {
    case 'association':
      return fromType === toType
        ? [`associação liga ator a caso de uso — ${pair} liga dois ${fromType === 'actor' ? 'atores' : 'casos de uso'}`]
        : []
    case 'include':
    case 'extend':
      return fromType === 'useCase' && toType === 'useCase'
        ? []
        : [`${linkKind(link.kind).keyword} liga dois casos de uso — ${pair} tem um ator na ponta`]
    case 'generalization':
      return fromType === toType
        ? []
        : [`generalização liga dois atores ou dois casos de uso — ${pair} mistura os dois`]
  }
}

/**
 * A mesma ligacao duas vezes desenha duas linhas uma em cima da outra, e quem le o
 * arquivo nao sabe se a segunda quer dizer algo. Acontece trocando a ponta de uma
 * ligacao no painel para o mesmo par de outra.
 */
function duplicateWarnings(doc: UseCaseDoc): string[] {
  const seen = new Set<string>()
  const warnings: string[] = []
  for (const link of doc.links) {
    const from = targetOf(doc, link.from)
    const to = targetOf(doc, link.to)
    if (!from || !to) continue
    // Associacao nao tem sentido: Relator → UC01 e UC01 → Relator sao a mesma.
    const ends = link.kind === 'association' ? [from, to].sort().join('|') : `${from}|${to}`
    const key = `${link.kind}|${ends}`
    if (seen.has(key)) warnings.push(`a ligação ${pairOf(doc, link)} aparece duas vezes`)
    seen.add(key)
  }
  return warnings
}

/**
 * Pela UML o ator fica fora do sistema: ele e quem usa, nao uma parte. Ator
 * desenhado dentro da fronteira diz outra coisa, sem querer.
 */
function boundaryWarnings(doc: UseCaseDoc): string[] {
  const bounds = systemBounds(doc.useCases)
  if (!bounds) return []
  return doc.actors.flatMap((actor) => {
    const size = ACTOR_SIZE[actor.kind]
    const x = actor.position.x + size.width / 2
    const y = actor.position.y + size.height / 2
    const inside = x > bounds.x && x < bounds.x + bounds.width && y > bounds.y && y < bounds.y + bounds.height
    return inside ? [`${actor.name || 'um ator sem nome'} está dentro da fronteira do sistema — ator fica do lado de fora`] : []
  })
}

/**
 * Inclusao em circulo (UC01 inclui UC02 que inclui UC01) nunca termina, e
 * generalizacao em circulo faz cada um ser um tipo do outro. Nenhuma das duas
 * trava o editor — as buscas guardam o que ja visitaram —, mas o desenho fica
 * dizendo algo impossivel.
 */
function cycleWarnings(doc: UseCaseDoc, kind: Extract<LinkKind, 'include' | 'generalization'>): string[] {
  const next = new Map<string, string[]>()
  for (const link of doc.links) {
    if (link.kind !== kind) continue
    const from = targetOf(doc, link.from)
    const to = targetOf(doc, link.to)
    const type = elementType(doc, from)
    if (!type || type !== elementType(doc, to) || from === to) continue
    if (kind === 'include' && type !== 'useCase') continue
    next.set(from, [...(next.get(from) ?? []), to])
  }

  const state = new Map<string, 'open' | 'done'>()
  const path: string[] = []
  const cycles = new Map<string, string[]>()

  const visit = (uid: string): void => {
    state.set(uid, 'open')
    path.push(uid)
    for (const target of next.get(uid) ?? []) {
      const seen = state.get(target)
      if (seen === 'open') {
        const cycle = path.slice(path.indexOf(target))
        // O mesmo circulo encontrado a partir de outro ponto e o mesmo aviso.
        const key = [...cycle].sort().join('|')
        if (!cycles.has(key)) cycles.set(key, cycle)
      } else if (!seen) {
        visit(target)
      }
    }
    path.pop()
    state.set(uid, 'done')
  }

  for (const uid of [...doc.actors.map((a) => a.uid), ...doc.useCases.map((u) => u.uid)]) {
    if (!state.has(uid)) visit(uid)
  }

  const label = kind === 'include' ? 'inclusão' : 'generalização'
  return [...cycles.values()].map((cycle) =>
    `${label} circular: ${[...cycle, cycle[0] ?? ''].map((uid) => keyOf(doc, uid)).join(' → ')}`)
}

function noteWarnings(doc: UseCaseDoc): string[] {
  return doc.notes.flatMap((note) => {
    if (!note.anchor || targetOf(doc, note.anchor)) return []
    const text = 'missing' in note.anchor ? note.anchor.missing : ''
    return [`nota aponta para "${text}", que não existe`]
  })
}

function coverageWarnings(doc: UseCaseDoc): string[] {
  const reached = new Set<string>()
  const idle: string[] = []

  for (const actor of doc.actors) {
    const capabilities = capabilitiesOf(doc, actor.uid)
    for (const capability of capabilities) reached.add(capability.useCase.uid)
    if (capabilities.length === 0) idle.push(actor.uid)
  }

  // Ator pai que so agrupa ("Usuario", com os filhos fazendo as coisas) nao e engano.
  const parents = parentActors(doc)

  // O mesmo vale para o caso de uso geral que so existe pelas variacoes: "Pagar",
  // com os atores ligados a "Pagar com Pix" e "Pagar com cartao". Sobe a cadeia — e
  // o que o geral inclui ou o que o estende tambem e alcancado por quem paga.
  let grew = true
  while (grew) {
    grew = false
    const add = (uid: string): void => {
      if (reached.has(uid)) return
      reached.add(uid)
      grew = true
    }
    for (const link of doc.links) {
      if (link.kind !== 'generalization') continue
      const child = targetOf(doc, link.from)
      const parent = targetOf(doc, link.to)
      if (elementType(doc, child) !== 'useCase' || elementType(doc, parent) !== 'useCase') continue
      if (reached.has(child)) add(parent)
    }
    for (const uid of [...reached]) carriedFrom(doc, uid).forEach(add)
  }

  return [
    ...doc.useCases
      .filter((useCase) => !reached.has(useCase.uid))
      .map((useCase) => `${useCase.id || useCase.name || 'caso de uso sem nome'} — nenhum ator chega a este caso de uso`),
    ...idle
      .filter((uid) => !parents.has(uid))
      .map((uid) => {
        const element = findElement(doc, uid)
        const actor = element?.type === 'actor' ? element.actor : undefined
        return `${keyOf(doc, uid)} não ${performVerb(actor)} nenhum caso de uso`
      }),
  ]
}
