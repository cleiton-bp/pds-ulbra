import type { Actor, Ref, UseCase, UseCaseDoc } from '../types'

/**
 * As pontas das ligacoes: como o arquivo cita um elemento e como a memoria aponta.
 *
 * No arquivo, uma ligacao cita o ator pelo nome e o caso de uso pelo codigo —
 * `from: Relator, to: UC01` —, que e o que deixa o yaml legivel. Em memoria ela
 * aponta pelo `uid` (ver `Ref` em `types`). A conversao entre os dois acontece so
 * aqui: na leitura (`resolveRef`) e na gravacao (`refText`).
 */

/** Ator ou caso de uso — as duas coisas que uma ligacao pode ligar. */
export type ElementType = 'actor' | 'useCase'

export type Element =
  | { type: 'actor'; uid: string; actor: Actor }
  | { type: 'useCase'; uid: string; useCase: UseCase }

type Elements = Pick<UseCaseDoc, 'actors' | 'useCases'>

export const bound = (uid: string): Ref => ({ uid })
export const missing = (text: string): Ref => ({ missing: text })

/**
 * O `uid` gravado na referencia — so a identidade, sem olhar o documento. Serve
 * para "esta ligacao e deste elemento?" na hora de apagar. Para saber onde a linha
 * chega, o certo e `targetOf`.
 */
export const refUid = (ref: Ref | null | undefined): string =>
  ref && 'uid' in ref ? ref.uid : ''

/** O texto de uma referencia que nao achou dono; vazio quando ela aponta para alguem. */
export const missingText = (ref: Ref | null | undefined): string =>
  ref && 'missing' in ref ? ref.missing : ''

export function findElement(doc: Elements, uid: string): Element | undefined {
  if (!uid) return undefined
  const actor = doc.actors.find((a) => a.uid === uid)
  if (actor) return { type: 'actor', uid, actor }
  const useCase = doc.useCases.find((u) => u.uid === uid)
  if (useCase) return { type: 'useCase', uid, useCase }
  return undefined
}

export const elementType = (doc: Elements, uid: string): ElementType | null =>
  findElement(doc, uid)?.type ?? null

/** O que identifica o elemento no arquivo: o nome do ator ou o codigo do caso de uso. */
export const elementKey = (element: Element): string =>
  element.type === 'actor' ? element.actor.name : element.useCase.id.trim()

/**
 * Acha o elemento que o arquivo cita. Ator antes de caso de uso, e o primeiro
 * quando ha dois com o mesmo nome — o nome repetido vira aviso, e a regra fixa
 * garante que reabrir o arquivo liga sempre no mesmo lugar.
 */
export function resolveRef(doc: Elements, text: string): Ref {
  const key = text.trim()
  if (!key) return missing(text)
  const actor = doc.actors.find((a) => a.name.trim() === key)
  if (actor) return bound(actor.uid)
  const useCase = doc.useCases.find((u) => u.id.trim() === key)
  if (useCase) return bound(useCase.uid)
  return missing(text)
}

/**
 * Onde a referencia chega agora: o `uid` do elemento, ou vazio se nao chega em ninguem.
 *
 * Referencia que o arquivo citava sem existir continua sendo texto, e e resolvida
 * aqui, pelo nome, a cada leitura — nunca presa a um elemento. Criar o "UC09" que
 * uma ligacao citava faz a linha aparecer; mas renomear um ator letra a letra,
 * passando por "Admin" a caminho de "Administrador", nao captura para sempre uma
 * ligacao antiga que citava "Admin": a linha aparece no meio da digitacao e some
 * quando o nome segue adiante, e o arquivo continua dizendo o que dizia.
 */
export function targetOf(doc: Elements, ref: Ref | null | undefined): string {
  if (!ref) return ''
  if ('uid' in ref) return findElement(doc, ref.uid) ? ref.uid : ''
  return refUid(resolveRef(doc, ref.missing))
}

/** O texto que a referencia vira no arquivo. */
export function refText(doc: Elements, ref: Ref): string {
  if ('missing' in ref) return ref.missing
  const element = findElement(doc, ref.uid)
  return element ? elementKey(element) : ''
}

/** Como o elemento aparece nas listas da tela: "Relator", "UC01 — Abrir relato". */
export function elementLabel(element: Element): string {
  if (element.type === 'actor') return element.actor.name || 'ator sem nome'
  const { id, name } = element.useCase
  return [id || 'sem código', name].filter(Boolean).join(' — ')
}

export function refLabel(doc: Elements, ref: Ref | null): string {
  if (!ref) return ''
  const element = findElement(doc, targetOf(doc, ref))
  if (element) return elementLabel(element)
  if ('missing' in ref) return ref.missing.trim() ? `"${ref.missing}" (não existe)` : '(vazio)'
  return '(apagado)'
}
