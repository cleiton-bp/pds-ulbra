import type {
  Actor, AlternativeFlow, DocMeta, Link, LinkKind, Note, Position, Ref, UseCase, UseCaseDoc,
} from '../types'
import { clampWidth, NOTE_DEFAULT_WIDTH, USE_CASE_DEFAULT_WIDTH } from './constants'
import { bound, elementType, missingText, refText, refUid, targetOf, type ElementType } from './refs'
import { collectWarnings } from './warnings'

/**
 * Transformacoes puras sobre o documento. Nenhuma toca em React ou em rede —
 * recebem um doc e devolvem outro, o que as torna faceis de conferir e testar.
 *
 * Renomear nao aparece aqui como operacao propria, e isso e de proposito: as
 * ligacoes apontam pelo `uid` (ver `Ref`), entao trocar o nome de um ator ou o
 * codigo de um caso de uso e um `update` como outro qualquer.
 */

export const setMeta = (doc: UseCaseDoc, patch: Partial<DocMeta>): UseCaseDoc => ({
  ...doc,
  meta: { ...doc.meta, ...patch },
})

// ---- atores ------------------------------------------------------------------

/** Sugere um nome livre: Ator, Ator 2, Ator 3… */
export function suggestActorName(doc: UseCaseDoc, base = 'Ator'): string {
  const taken = new Set(doc.actors.map((a) => a.name))
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base} ${i}`)) i += 1
  return `${base} ${i}`
}

export function addActor(doc: UseCaseDoc, uid: string, position: Position): UseCaseDoc {
  const actor: Actor = { uid, name: suggestActorName(doc), kind: 'person', description: '', position, extra: {} }
  return { ...doc, actors: [...doc.actors, actor] }
}

/**
 * Escolher o tipo do ator no painel descarta o tipo desconhecido que o arquivo
 * trazia guardado (ver `Extra`) — senao ele voltaria para o arquivo por cima da escolha.
 */
export const updateActor = (doc: UseCaseDoc, uid: string, patch: Partial<Actor>): UseCaseDoc => ({
  ...doc,
  actors: doc.actors.map((a) => {
    if (a.uid !== uid) return a
    if (patch.kind === undefined || !('kind' in a.extra)) return { ...a, ...patch }
    const { kind: _discarded, ...extra } = a.extra
    return { ...a, ...patch, extra }
  }),
})

/**
 * Tira o elemento das ligacoes e das setas de nota.
 * A ligacao sai junto, porque uma linha com uma ponta so nao desenha nada. A
 * nota fica: o texto continua valendo mesmo sem o elemento que ele explicava.
 */
function detach(doc: UseCaseDoc, uid: string): UseCaseDoc {
  return {
    ...doc,
    links: doc.links.filter((l) => refUid(l.from) !== uid && refUid(l.to) !== uid),
    notes: doc.notes.map((n) => (refUid(n.anchor) === uid ? { ...n, anchor: null } : n)),
  }
}

export const deleteActor = (doc: UseCaseDoc, uid: string): UseCaseDoc =>
  detach({ ...doc, actors: doc.actors.filter((a) => a.uid !== uid) }, uid)

// ---- casos de uso ------------------------------------------------------------

/**
 * O proximo codigo livre, UC01, UC02… — sempre depois do maior que existe, para
 * um codigo apagado nao voltar como outro caso de uso. `taken` inclui tambem o que
 * as ligacoes citam sem existir: reaproveitar esse codigo ligaria a elipse nova a
 * uma ligacao antiga sem ninguem pedir.
 *
 * Os digitos seguem o arquivo: quem numera UC001 continua ganhando UC002.
 */
export function nextFreeId(taken: Iterable<string>): string {
  let highest = 0
  let digits = 0
  for (const id of taken) {
    const match = /^UC(\d+)$/i.exec(id.trim())
    if (!match?.[1]) continue
    highest = Math.max(highest, Number(match[1]))
    digits = Math.max(digits, match[1].length)
  }
  // Sem nenhum codigo ainda, dois digitos — UC01 — que e o costume.
  return `UC${String(highest + 1).padStart(digits || 2, '0')}`
}

/** O que as ligacoes e notas citam sem existir — ver `nextFreeId`. */
export const citedButMissing = (doc: UseCaseDoc): string[] => [
  ...doc.links.flatMap((l) => [missingText(l.from), missingText(l.to)]),
  ...doc.notes.map((n) => missingText(n.anchor)),
].filter(Boolean)

export const nextUseCaseId = (doc: UseCaseDoc): string =>
  nextFreeId([...doc.useCases.map((u) => u.id), ...citedButMissing(doc)])

export const blankUseCase = (uid: string, id: string, position: Position): UseCase => ({
  uid,
  id,
  name: '',
  description: '',
  position,
  width: USE_CASE_DEFAULT_WIDTH,
  preconditions: '',
  postconditions: '',
  mainFlow: [],
  alternativeFlows: [],
  extra: {},
})

export const addUseCase = (doc: UseCaseDoc, uid: string, position: Position): UseCaseDoc => ({
  ...doc,
  useCases: [...doc.useCases, blankUseCase(uid, nextUseCaseId(doc), position)],
})

const replaceUseCase = (doc: UseCaseDoc, uid: string, fn: (useCase: UseCase) => UseCase): UseCaseDoc => ({
  ...doc,
  useCases: doc.useCases.map((u) => (u.uid === uid ? fn(u) : u)),
})

export const updateUseCase = (doc: UseCaseDoc, uid: string, patch: Partial<UseCase>): UseCaseDoc =>
  replaceUseCase(doc, uid, (u) => {
    const next = { ...u, ...patch }
    return patch.width === undefined ? next : { ...next, width: clampWidth(patch.width) }
  })

export const deleteUseCase = (doc: UseCaseDoc, uid: string): UseCaseDoc =>
  detach({ ...doc, useCases: doc.useCases.filter((u) => u.uid !== uid) }, uid)

export const addAlternativeFlow = (doc: UseCaseDoc, useCaseUid: string, flowUid: string): UseCaseDoc =>
  replaceUseCase(doc, useCaseUid, (u) => ({
    ...u,
    alternativeFlows: [...u.alternativeFlows, { uid: flowUid, title: '', steps: [], extra: {} }],
  }))

export const updateAlternativeFlow = (
  doc: UseCaseDoc,
  useCaseUid: string,
  flowUid: string,
  patch: Partial<AlternativeFlow>,
): UseCaseDoc =>
  replaceUseCase(doc, useCaseUid, (u) => ({
    ...u,
    alternativeFlows: u.alternativeFlows.map((f) => (f.uid === flowUid ? { ...f, ...patch } : f)),
  }))

export const deleteAlternativeFlow = (doc: UseCaseDoc, useCaseUid: string, flowUid: string): UseCaseDoc =>
  replaceUseCase(doc, useCaseUid, (u) => ({
    ...u,
    alternativeFlows: u.alternativeFlows.filter((f) => f.uid !== flowUid),
  }))

// ---- notas ---------------------------------------------------------------------

export function addNote(doc: UseCaseDoc, uid: string, position: Position): UseCaseDoc {
  const note: Note = { uid, text: '', position, width: NOTE_DEFAULT_WIDTH, anchor: null, extra: {} }
  return { ...doc, notes: [...doc.notes, note] }
}

export const updateNote = (doc: UseCaseDoc, uid: string, patch: Partial<Note>): UseCaseDoc => ({
  ...doc,
  notes: doc.notes.map((n) => (n.uid === uid ? { ...n, ...patch } : n)),
})

export const deleteNote = (doc: UseCaseDoc, uid: string): UseCaseDoc => ({
  ...doc,
  notes: doc.notes.filter((n) => n.uid !== uid),
})

// ---- ligacoes ------------------------------------------------------------------

/**
 * O tipo que faz sentido entre duas pontas — o que o canvas escolhe ao puxar uma
 * linha, antes de a pessoa dizer outra coisa no painel.
 * Ator com ator so pode ser generalizacao; ator com caso de uso, associacao; e
 * entre dois casos de uso a inclusao e a mais comum das tres possiveis.
 */
export function inferLinkKind(from: ElementType | null, to: ElementType | null): LinkKind {
  if (from === 'actor' && to === 'actor') return 'generalization'
  if (from === 'useCase' && to === 'useCase') return 'include'
  return 'association'
}

/** Se o tipo combina com as pontas. Ponta que nao existe nao reprova ninguem. */
export function kindFits(kind: LinkKind, from: ElementType | null, to: ElementType | null): boolean {
  if (!from || !to) return true
  switch (kind) {
    case 'association': return from !== to
    case 'include':
    case 'extend': return from === 'useCase' && to === 'useCase'
    case 'generalization': return from === to
  }
}

/** Associacao grava o ator em `from` — o arquivo le "Relator → UC01", nunca o contrario. */
function orient(doc: UseCaseDoc, link: Link): Link {
  if (link.kind !== 'association') return link
  const fromType = elementType(doc, targetOf(doc, link.from))
  const toType = elementType(doc, targetOf(doc, link.to))
  return fromType === 'useCase' && toType === 'actor' ? { ...link, from: link.to, to: link.from } : link
}

const sameEnds = (doc: UseCaseDoc, link: Link, from: string, to: string): boolean =>
  targetOf(doc, link.from) === from && targetOf(doc, link.to) === to

/**
 * Liga dois elementos. Ignora ligacao de um elemento com ele mesmo e repeticao
 * exata — as duas so gerariam linha inutil no canvas. Sem `kind`, escolhe pelo
 * tipo das pontas (ver `inferLinkKind`).
 */
export function addLink(
  doc: UseCaseDoc,
  uid: string,
  fromUid: string,
  toUid: string,
  kind?: LinkKind,
): UseCaseDoc {
  if (fromUid === toUid) return doc
  const fromType = elementType(doc, fromUid)
  const toType = elementType(doc, toUid)
  if (!fromType || !toType) return doc

  const link = orient(doc, {
    uid,
    from: bound(fromUid),
    to: bound(toUid),
    kind: kind ?? inferLinkKind(fromType, toType),
    unknownKind: '',
    note: '',
    extra: {},
  })

  // Associacao nao tem sentido: Relator → UC01 e UC01 → Relator sao a mesma linha.
  const [from, to] = [refUid(link.from), refUid(link.to)]
  const duplicate = doc.links.some((l) => l.kind === link.kind && (
    sameEnds(doc, l, from, to) || (link.kind === 'association' && sameEnds(doc, l, to, from))
  ))
  if (duplicate) return doc

  return { ...doc, links: [...doc.links, link] }
}

export type LinkPatch = Partial<Pick<Link, 'from' | 'to' | 'kind' | 'note'>>

/**
 * Troca uma ponta, o tipo ou a observacao. Trocar a ponta por um elemento com o
 * qual o tipo atual nao combina reescolhe o tipo — levar a ponta de uma inclusao
 * para um ator so pode virar associacao. Qualquer tipo escolhido aqui substitui o
 * tipo desconhecido que o arquivo trazia (ver `Link.unknownKind`).
 */
export function updateLink(doc: UseCaseDoc, uid: string, patch: LinkPatch): UseCaseDoc {
  return {
    ...doc,
    links: doc.links.map((link) => {
      if (link.uid !== uid) return link
      let next: Link = { ...link, ...patch }
      const fromType = elementType(doc, targetOf(doc, next.from))
      const toType = elementType(doc, targetOf(doc, next.to))
      const endsChanged = patch.from !== undefined || patch.to !== undefined
      if (endsChanged && patch.kind === undefined && !kindFits(next.kind, fromType, toType)) {
        next = { ...next, kind: inferLinkKind(fromType, toType), unknownKind: '' }
      }
      if (patch.kind !== undefined) next = { ...next, unknownKind: '' }
      return orient(doc, next)
    }),
  }
}

/** Inverte o sentido. Na associacao nao muda nada — o ator continua em `from`. */
export const reverseLink = (doc: UseCaseDoc, uid: string): UseCaseDoc => ({
  ...doc,
  links: doc.links.map((l) => (l.uid === uid ? orient(doc, { ...l, from: l.to, to: l.from }) : l)),
})

export const deleteLink = (doc: UseCaseDoc, uid: string): UseCaseDoc => ({
  ...doc,
  links: doc.links.filter((l) => l.uid !== uid),
})

// ---- o que deriva do resto -----------------------------------------------------

/**
 * Recalcula o que deriva do resto — hoje, os avisos.
 * Roda na abertura do arquivo e depois de cada edicao — uma regra so para os dois.
 */
export const refresh = (doc: UseCaseDoc): UseCaseDoc => ({ ...doc, warnings: collectWarnings(doc) })

// ---- releitura do mesmo arquivo --------------------------------------------------

/**
 * Leva os `uid` da leitura anterior para a nova leitura do mesmo arquivo.
 *
 * Cada leitura gera `uid` novos, e a selecao da tela aponta por `uid`: sem isto,
 * toda gravacao feita por fora (VSCode, IA) derrubaria o que estava escolhido e o
 * painel voltaria para o arquivo no meio da leitura. Quem continua no arquivo
 * recupera o `uid` antigo — ator pelo nome, caso de uso pelo codigo, ligacao pelas
 * pontas e pelo tipo, nota e fluxo pela posicao na lista. Quem mudou de nome e
 * tratado como novo, que e o que ele e para quem le o arquivo.
 */
export function carryUids(previous: UseCaseDoc, next: UseCaseDoc): UseCaseDoc {
  const carried = new Map<string, string>()

  const claim = <T extends { uid: string }>(
    before: readonly T[],
    after: readonly T[],
    keyBefore: (item: T, index: number) => string,
    keyAfter: (item: T, index: number) => string = keyBefore,
  ): void => {
    const pool = new Map<string, string[]>()
    before.forEach((item, index) => {
      const key = keyBefore(item, index)
      pool.set(key, [...(pool.get(key) ?? []), item.uid])
    })
    after.forEach((item, index) => {
      const uid = pool.get(keyAfter(item, index))?.shift()
      if (uid) carried.set(item.uid, uid)
    })
  }

  claim(previous.actors, next.actors, (a) => a.name)
  claim(previous.useCases, next.useCases, (u) => u.id)
  claim(previous.links, next.links,
    (l) => `${refText(previous, l.from)}|${refText(previous, l.to)}|${l.kind}`,
    (l) => `${refText(next, l.from)}|${refText(next, l.to)}|${l.kind}`)
  claim(previous.notes, next.notes, (_, index) => String(index))

  const uid = (value: string): string => carried.get(value) ?? value
  const ref = <T extends Ref | null>(value: T): T =>
    (value && 'uid' in value ? { uid: uid(value.uid) } : value) as T
  const flowsBefore = new Map(previous.useCases.map((u) => [u.uid, u.alternativeFlows]))

  return {
    ...next,
    actors: next.actors.map((a) => ({ ...a, uid: uid(a.uid) })),
    useCases: next.useCases.map((u) => {
      const flows = flowsBefore.get(uid(u.uid)) ?? []
      return {
        ...u,
        uid: uid(u.uid),
        alternativeFlows: u.alternativeFlows.map((f, index) => ({ ...f, uid: flows[index]?.uid ?? f.uid })),
      }
    }),
    links: next.links.map((l) => ({ ...l, uid: uid(l.uid), from: ref(l.from), to: ref(l.to) })),
    notes: next.notes.map((n) => ({ ...n, uid: uid(n.uid), anchor: ref(n.anchor) })),
  }
}
