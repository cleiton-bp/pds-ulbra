import type { ActorKind, LinkKind } from '../types'

/**
 * Os quatro tipos de ligacao e o que cada um quer dizer.
 *
 * `keyword` e o que a UML escreve sobre a linha — vazio e linha sem rotulo. As
 * palavras-chave ficam no original porque e assim que aparecem em qualquer livro
 * ou material de aula; o resto da tela fala portugues.
 */
export const LINK_KINDS: ReadonlyArray<{
  value: LinkKind
  label: string
  keyword: string
  hint: string
}> = [
  {
    value: 'association',
    label: 'associação',
    keyword: '',
    hint: 'O ator realiza o caso de uso. A linha não tem seta: o sentido não carrega significado.',
  },
  {
    value: 'include',
    label: 'inclusão',
    keyword: '«include»',
    hint: 'Toda vez que o de origem acontece, o de destino acontece junto — é um pedaço obrigatório dele, separado para não se repetir em vários casos de uso.',
  },
  {
    value: 'extend',
    label: 'extensão',
    keyword: '«extend»',
    hint: 'O de origem acrescenta algo ao de destino, e só numa certa condição. A seta aponta para o caso de uso que é estendido.',
  },
  {
    value: 'generalization',
    label: 'generalização',
    keyword: '',
    hint: 'O de origem é um caso particular do de destino e herda tudo o que ele faz. O triângulo fica no mais geral.',
  },
]

export const ACTOR_KINDS: ReadonlyArray<{ value: ActorKind; label: string }> = [
  { value: 'person', label: 'pessoa' },
  { value: 'system', label: 'sistema externo' },
]

export const isLinkKind = (value: unknown): value is LinkKind =>
  LINK_KINDS.some((kind) => kind.value === value)

export const isActorKind = (value: unknown): value is ActorKind =>
  ACTOR_KINDS.some((kind) => kind.value === value)

export const linkKind = (kind: LinkKind): (typeof LINK_KINDS)[number] =>
  LINK_KINDS.find((k) => k.value === kind) ?? LINK_KINDS[0]!

let uidCounter = 0
/** Identificador de sessao para o React ter chave estavel. Nunca serializado. */
export const newUid = (prefix: string): string => `${prefix}${++uidCounter}`

export const NOTE_DEFAULT_WIDTH = 240

/** A elipse cresce para os lados quando o nome e longo; fora desta faixa fica ilegivel. */
export const USE_CASE_DEFAULT_WIDTH = 190
export const USE_CASE_MIN_WIDTH = 150
export const USE_CASE_MAX_WIDTH = 360

export const clampWidth = (width: number): number =>
  Math.min(USE_CASE_MAX_WIDTH, Math.max(USE_CASE_MIN_WIDTH, Math.round(width)))
