import type { Actor, Link, Selection, UseCase, UseCaseDoc } from '../types'
import { elementType, findElement, refLabel, targetOf } from './refs'

/**
 * Quem faz o que — a pergunta que um diagrama de casos de uso existe para responder.
 *
 * Um ator realiza:
 * 1. o que esta ligado a ele;
 * 2. o que esta ligado aos atores de quem ele e um tipo (generalizacao) — o
 *    administrador que e um tipo de membro do time faz tudo o que o membro faz;
 * 3. tudo o que os dois itens acima arrastam junto: o que e incluido, o que
 *    estende, e as variacoes especializadas.
 *
 * Calculado aqui, uma vez, e lido pelo painel, pelo realce do canvas e pelos avisos.
 * Toda busca guarda o que ja visitou, entao ligacao circular nao trava nada — ela
 * so vira aviso.
 */

/** Por que o ator chega no caso de uso. `from` e o `uid` de quem levou ate ele. */
export type Via = 'direct' | 'inherited' | 'include' | 'extend' | 'generalization'

export type Capability = { useCase: UseCase; via: Via; from: string }

export type Performer = { actor: Actor; via: Via; from: string }

type Reach = { via: Via; from: string }

/** Os atores de quem este e um tipo, do mais proximo ao mais distante. */
export function ancestorsOf(doc: UseCaseDoc, actorUid: string): string[] {
  const found: string[] = []
  const seen = new Set([actorUid])
  const queue = [actorUid]

  for (let current = queue.shift(); current !== undefined; current = queue.shift()) {
    for (const link of doc.links) {
      if (link.kind !== 'generalization' || targetOf(doc, link.from) !== current) continue
      const parent = targetOf(doc, link.to)
      if (seen.has(parent) || elementType(doc, parent) !== 'actor') continue
      seen.add(parent)
      found.push(parent)
      queue.push(parent)
    }
  }

  return found
}

/**
 * O caso de uso do outro lado de uma associacao com este ator. A associacao nao
 * tem sentido, entao o ator pode estar em qualquer uma das pontas.
 */
function associatedUseCase(doc: UseCaseDoc, link: Link, actorUid: string): string {
  if (link.kind !== 'association') return ''
  const from = targetOf(doc, link.from)
  const to = targetOf(doc, link.to)
  if (from === actorUid && elementType(doc, to) === 'useCase') return to
  if (to === actorUid && elementType(doc, from) === 'useCase') return from
  return ''
}

/**
 * O caso de uso que a ligacao arrasta junto quando `useCaseUid` acontece:
 * - include: o base puxa o incluido (a seta sai do base);
 * - extend: o base abre espaco para a extensao (a seta chega no base);
 * - generalization: o geral vale tambem para as variacoes (a seta chega no geral).
 */
function carried(doc: UseCaseDoc, link: Link, useCaseUid: string): string {
  const from = targetOf(doc, link.from)
  const to = targetOf(doc, link.to)
  const bothUseCases = elementType(doc, from) === 'useCase' && elementType(doc, to) === 'useCase'
  if (!bothUseCases) return ''
  if (link.kind === 'include' && from === useCaseUid) return to
  if ((link.kind === 'extend' || link.kind === 'generalization') && to === useCaseUid) return from
  return ''
}

/** Os casos de uso que `useCaseUid` arrasta junto, por qualquer ligacao — ver `carried`. */
export const carriedFrom = (doc: UseCaseDoc, useCaseUid: string): string[] =>
  doc.links.map((link) => carried(doc, link, useCaseUid)).filter(Boolean)

/** O que o ator realiza, na ordem em que os casos de uso aparecem no arquivo. */
export function capabilitiesOf(doc: UseCaseDoc, actorUid: string): Capability[] {
  const found = new Map<string, Reach>()

  // O proprio ator vem antes dos ancestrais: o que ele faz direto nao aparece como herdado.
  for (const who of [actorUid, ...ancestorsOf(doc, actorUid)]) {
    for (const link of doc.links) {
      const useCaseUid = associatedUseCase(doc, link, who)
      if (!useCaseUid || found.has(useCaseUid)) continue
      found.set(useCaseUid, who === actorUid ? { via: 'direct', from: '' } : { via: 'inherited', from: who })
    }
  }

  const queue = [...found.keys()]
  for (let current = queue.shift(); current !== undefined; current = queue.shift()) {
    for (const link of doc.links) {
      const next = carried(doc, link, current)
      if (!next || found.has(next)) continue
      found.set(next, { via: link.kind as Via, from: current })
      queue.push(next)
    }
  }

  return doc.useCases.flatMap((useCase) => {
    const reach = found.get(useCase.uid)
    return reach ? [{ useCase, ...reach }] : []
  })
}

/** Quem realiza o caso de uso, e por qual caminho chega nele. */
export function performersOf(doc: UseCaseDoc, useCaseUid: string): Performer[] {
  return doc.actors.flatMap((actor) => {
    const capability = capabilitiesOf(doc, actor.uid).find((c) => c.useCase.uid === useCaseUid)
    return capability ? [{ actor, via: capability.via, from: capability.from }] : []
  })
}

/** Os casos de uso que algum ator alcanca. O que sobra ninguem consegue fazer. */
export function reachedUseCases(doc: UseCaseDoc): Set<string> {
  const reached = new Set<string>()
  for (const actor of doc.actors) {
    for (const capability of capabilitiesOf(doc, actor.uid)) reached.add(capability.useCase.uid)
  }
  return reached
}

/** Atores que sao pai de outro numa generalizacao — o "Usuario" que so agrupa. */
export function parentActors(doc: UseCaseDoc): Set<string> {
  const parents = new Set<string>()
  for (const link of doc.links) {
    if (link.kind !== 'generalization') continue
    const from = targetOf(doc, link.from)
    const to = targetOf(doc, link.to)
    if (elementType(doc, from) === 'actor' && elementType(doc, to) === 'actor') parents.add(to)
  }
  return parents
}

const nameOf = (doc: UseCaseDoc, uid: string): string => {
  const who = findElement(doc, uid)
  return who?.type === 'actor' ? who.actor.name : who?.type === 'useCase' ? who.useCase.id : '?'
}

/**
 * Por que o ator chega no caso de uso, dito do ponto de vista do CASO DE USO — e
 * o que aparece ao lado dele na lista do que o ator faz: "UC07 · incluído por UC05".
 */
export function viaLabel(doc: UseCaseDoc, via: Via, from: string): string {
  const name = nameOf(doc, from)
  switch (via) {
    case 'direct': return 'diretamente'
    case 'inherited': return `herda de ${name}`
    case 'include': return `incluído por ${name}`
    case 'extend': return `estende ${name}`
    case 'generalization': return `variação de ${name}`
  }
}

/**
 * O mesmo motivo do ponto de vista do ATOR, para a lista de quem realiza um caso
 * de uso: "Membro do time · ao fazer UC05". Reusar o texto de cima ali diria que o
 * ator foi "incluído por UC05", que e uma relacao que nao existe.
 */
export function performerViaLabel(doc: UseCaseDoc, via: Via, from: string): string {
  if (via === 'direct') return 'diretamente'
  if (via === 'inherited') return `como ${nameOf(doc, from)}`
  return `ao fazer ${nameOf(doc, from)}`
}

/**
 * Sistema externo participa do caso de uso, mas nao o realiza: quem faz o
 * pagamento e a pessoa, o banco so responde. O verbo muda conforme o tipo do ator.
 */
export const performVerb = (actor: Actor | undefined): string =>
  actor?.kind === 'system' ? 'participa de' : 'realiza'

/**
 * O que acende no canvas com o realce ligado.
 *
 * Ator escolhido: ele, os atores de quem ele herda e tudo o que ele realiza.
 * Caso de uso escolhido: ele, quem o realiza e os casos de uso ligados a ele.
 * Qualquer outra escolha — ou nenhuma — nao realca nada.
 */
export function focusOf(doc: UseCaseDoc, selection: Selection): Set<string> | null {
  if (selection?.type === 'actor') {
    if (!findElement(doc, selection.uid)) return null
    return new Set([
      selection.uid,
      ...ancestorsOf(doc, selection.uid),
      ...capabilitiesOf(doc, selection.uid).map((c) => c.useCase.uid),
    ])
  }

  if (selection?.type === 'useCase') {
    if (!findElement(doc, selection.uid)) return null
    const neighbours = doc.links.flatMap((link) => {
      if (link.kind === 'association') return []
      const from = targetOf(doc, link.from)
      const to = targetOf(doc, link.to)
      if (from === selection.uid) return [to]
      if (to === selection.uid) return [from]
      return []
    })
    return new Set([
      selection.uid,
      ...performersOf(doc, selection.uid).map((p) => p.actor.uid),
      ...neighbours.filter((uid) => elementType(doc, uid) === 'useCase'),
    ])
  }

  return null
}

/** A ligacao lida como frase: "Relator realiza UC01 — Abrir relato". */
export function linkSentence(doc: UseCaseDoc, link: Link): string {
  const from = refLabel(doc, link.from)
  const to = refLabel(doc, link.to)

  switch (link.kind) {
    case 'association': {
      // A frase sempre comeca pelo ator, em qualquer das pontas que ele esteja.
      const fromElement = findElement(doc, targetOf(doc, link.from))
      const toElement = findElement(doc, targetOf(doc, link.to))
      const fromIsActor = fromElement?.type === 'actor'
      const toIsActor = toElement?.type === 'actor'
      if (!fromIsActor && toIsActor) return `${to} ${performVerb(toElement.actor)} ${from}`
      if (fromIsActor && !toIsActor) return `${from} ${performVerb(fromElement.actor)} ${to}`
      return `${from} — ${to}`
    }
    case 'include': return `${from} inclui ${to}`
    case 'extend': return `${from} estende ${to}`
    case 'generalization': return `${from} é um tipo de ${to}`
  }
}

/** As ligacoes que tocam um elemento, na ordem do arquivo. */
export const linksOf = (doc: UseCaseDoc, uid: string): Link[] =>
  doc.links.filter((link) => targetOf(doc, link.from) === uid || targetOf(doc, link.to) === uid)
