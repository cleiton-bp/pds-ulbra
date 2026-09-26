import type { Field, RelationKind } from '../types'

/** As bandeiras do campo, na ordem em que aparecem. Usadas no canvas e no painel. */
export const FIELD_FLAGS: ReadonlyArray<{ key: keyof Field; label: string; title: string }> = [
  { key: 'pk', label: 'PK', title: 'chave primária' },
  { key: 'fk', label: 'FK', title: 'chave estrangeira' },
  { key: 'required', label: 'obrig', title: 'obrigatório' },
  { key: 'unique', label: 'único', title: 'valor único' },
]

export const RELATION_KINDS: ReadonlyArray<{ value: RelationKind; label: string }> = [
  { value: 'one-to-one', label: '1:1' },
  { value: 'one-to-many', label: '1:N' },
  { value: 'many-to-many', label: 'N:N' },
]

/** Sugestoes do autocomplete de tipo. Nao e uma lista fechada — da para escrever outro. */
export const COMMON_TYPES = [
  'int', 'bigint', 'guid', 'text', 'varchar', 'bool',
  'decimal', 'datetime', 'date', 'enum', 'json',
] as const

export const relationLabel = (kind: RelationKind): string =>
  RELATION_KINDS.find((k) => k.value === kind)?.label ?? kind

export const isRelationKind = (value: unknown): value is RelationKind =>
  RELATION_KINDS.some((k) => k.value === value)

let uidCounter = 0
/** Identificador de sessao para o React ter chave estavel. Nunca serializado. */
export const newUid = (prefix: string): string => `${prefix}${++uidCounter}`

export const NOTE_DEFAULT_WIDTH = 260
