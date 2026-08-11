/**
 * O vocabulario do editor, num lugar so.
 *
 * Sao `type` e nao `interface` de proposito: o React Flow exige que o payload de
 * um no seja compativel com Record<string, unknown>, e interface nao satisfaz
 * essa restricao em TypeScript.
 */

export type RelationKind = 'one-to-one' | 'one-to-many' | 'many-to-many'

/** Coluna de uma entidade. `uid` so existe em memoria, nunca vai para o arquivo. */
export type Field = {
  uid: string
  name: string
  type: string
  pk?: boolean
  fk?: boolean
  required?: boolean
  unique?: boolean
  note?: string
}

export type Position = { x: number; y: number }

export type Entity = {
  uid: string
  /** Nome no codigo, em ingles — e o que as relacoes referenciam. */
  name: string
  /** Nome no dominio, em portugues. Opcional. */
  label: string
  description: string
  position: Position
  fields: Field[]
}

/**
 * Liga duas entidades pelo `name`, nao por id — mantem o arquivo legivel.
 *
 * `fromField` e `toField` sao opcionais: com eles a linha gruda na altura daquele
 * campo (como no DBeaver, FK apontando para PK); sem eles, gruda na caixa inteira.
 * O lado em que a linha encosta nunca e gravado — e recalculado pela posicao das
 * caixas, senao arrastar uma tabela deixaria a linha entrando pelo lado errado.
 */
export type Relation = {
  uid: string
  from: string
  to: string
  kind: RelationKind
  note: string
  fromField: string
  toField: string
}

/** Lado da caixa em que a linha encosta. Calculado, nunca gravado no arquivo. */
export type Side = 'left' | 'right' | 'top' | 'bottom'

/** Caixa de texto livre no canvas, para explicacao que nao cabe em tabela. */
export type Note = {
  uid: string
  text: string
  position: Position
  width: number
  /** Nome da entidade que a nota aponta com uma seta. Vazio = nota solta. */
  anchor: string
  /** Campo especifico dessa entidade. Vazio = aponta para a caixa inteira. */
  anchorField: string
}

export type DocMeta = {
  title: string
  description: string
}

export type ModelDoc = {
  meta: DocMeta
  entities: Entity[]
  relations: Relation[]
  notes: Note[]
  /** Problemas que nao impedem a edicao — ex.: relacao apontando para entidade que sumiu. */
  warnings: string[]
}

/** Erro de sintaxe no arquivo: o editor mostra o aviso em vez de abrir vazio. */
export type ParseResult = { ok: true; doc: ModelDoc } | { ok: false; error: string }

export type Selection =
  | { type: 'entity'; uid: string }
  | { type: 'relation'; uid: string }
  | { type: 'note'; uid: string }
  | null

export type FileEntry = {
  name: string
  mtime: number
  size: number
}
