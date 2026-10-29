import type { Entity, Field, ModelDoc, Note, Relation } from '../types'

/**
 * O que um arquivo de modelagem muda em relacao a outro: normalmente o anterior.
 *
 * Cada arquivo repete as tabelas de antes para dar contexto, e quem abre quer saber
 * o que ele acrescenta. A marca `inherited` e a nota "coluna nova" sao escritas a
 * mao e escapam: uma tabela alterada continua marcada como herdada. Aqui a resposta
 * sai da comparacao dos dois arquivos, e e so de tela: nada disto volta para o yaml.
 *
 * Tabela e campo se reconhecem pelo nome; relacao, pelas duas pontas e o tipo; nota,
 * pelo texto.
 */

/** `text`: so a explicacao mudou (descricao, rotulo, observacao do campo, acento). */
export type ChangeKind = 'new' | 'changed' | 'text' | 'same'

export type FieldChange = {
  name: string
  kind: 'new' | 'changed' | 'text'
  /** O que mudou, em palavras: "tipo text → guid", "agora obrigatório"… */
  details: string[]
}

export type EntityChange = {
  name: string
  kind: ChangeKind
  /** Por nome de campo; campo sem mudanca nao entra. */
  fields: Map<string, FieldChange>
  /** Campos que existiam na base e sumiram, so na tela, riscados. */
  removedFields: Field[]
  /** A descricao ou o nome no dominio da tabela mudaram. */
  textChanged: boolean
}

export type ChangeSet = {
  /** Nome do arquivo comparado. */
  base: string
  entities: Map<string, EntityChange>
  removedEntities: Entity[]
  /** Chave de cada relacao nova (ver `relationKey`). */
  newRelations: Set<string>
  removedRelations: Relation[]
  /** Texto (sem espacos nas pontas) de cada nota que a base nao tinha. */
  newNotes: Set<string>
  counts: {
    newEntities: number
    changedEntities: number
    textEntities: number
    newFields: number
    changedFields: number
    removedFields: number
    newRelations: number
    newNotes: number
  }
}

export const relationKey = (relation: Relation): string =>
  [relation.from, relation.to, relation.kind, relation.fromField, relation.toField].join('|')

export const noteKey = (note: Note): string => note.text.trim()

const FLAG_WORDS: ReadonlyArray<[keyof Field, string, string]> = [
  ['pk', 'agora é chave primária', 'deixou de ser chave primária'],
  ['fk', 'agora é chave estrangeira', 'deixou de ser chave estrangeira'],
  ['required', 'agora obrigatório', 'deixou de ser obrigatório'],
  ['unique', 'agora único', 'deixou de ser único'],
]

function compareField(before: Field, after: Field): FieldChange | null {
  const details: string[] = []
  if (before.type !== after.type) details.push(`tipo ${before.type || 'vazio'} → ${after.type || 'vazio'}`)
  for (const [key, on, off] of FLAG_WORDS) {
    if (Boolean(before[key]) !== Boolean(after[key])) details.push(after[key] ? on : off)
  }
  if (details.length > 0) return { name: after.name, kind: 'changed', details }
  if ((before.note ?? '').trim() !== (after.note ?? '').trim()) {
    return { name: after.name, kind: 'text', details: ['observação reescrita'] }
  }
  return null
}

function compareEntity(before: Entity | undefined, after: Entity): EntityChange {
  const fields = new Map<string, FieldChange>()
  if (!before) {
    for (const field of after.fields) fields.set(field.name, { name: field.name, kind: 'new', details: [] })
    return { name: after.name, kind: 'new', fields, removedFields: [], textChanged: false }
  }

  const old = new Map(before.fields.map((field) => [field.name, field]))
  for (const field of after.fields) {
    const previous = old.get(field.name)
    if (!previous) {
      fields.set(field.name, { name: field.name, kind: 'new', details: [] })
      continue
    }
    const change = compareField(previous, field)
    if (change) fields.set(field.name, change)
  }
  const names = new Set(after.fields.map((field) => field.name))
  const removedFields = before.fields.filter((field) => !names.has(field.name))

  const textChanged = before.description.trim() !== after.description.trim()
    || before.label.trim() !== after.label.trim()
  const structural = removedFields.length > 0
    || [...fields.values()].some((change) => change.kind !== 'text')
  const kind: ChangeKind = structural ? 'changed'
    : fields.size > 0 || textChanged ? 'text'
    : 'same'

  return { name: after.name, kind, fields, removedFields, textChanged }
}

export function diffDocs(baseName: string, base: ModelDoc, doc: ModelDoc): ChangeSet {
  const baseEntities = new Map(base.entities.map((entity) => [entity.name, entity]))
  const entities = new Map(doc.entities.map((entity) => [entity.name, compareEntity(baseEntities.get(entity.name), entity)]))

  const names = new Set(doc.entities.map((entity) => entity.name))
  const removedEntities = base.entities.filter((entity) => !names.has(entity.name))

  const baseRelations = new Set(base.relations.map(relationKey))
  const newRelations = new Set(doc.relations.map(relationKey).filter((key) => !baseRelations.has(key)))
  const currentRelations = new Set(doc.relations.map(relationKey))
  const removedRelations = base.relations.filter((relation) => !currentRelations.has(relationKey(relation)))

  const baseNotes = new Set(base.notes.map(noteKey))
  const newNotes = new Set(doc.notes.map(noteKey).filter((key) => key && !baseNotes.has(key)))

  const all = [...entities.values()]
  const fieldsOf = (kind: FieldChange['kind']): number =>
    all.filter((entity) => entity.kind !== 'new')
      .reduce((sum, entity) => sum + [...entity.fields.values()].filter((field) => field.kind === kind).length, 0)

  return {
    base: baseName,
    entities,
    removedEntities,
    newRelations,
    removedRelations,
    newNotes,
    counts: {
      newEntities: all.filter((entity) => entity.kind === 'new').length,
      changedEntities: all.filter((entity) => entity.kind === 'changed').length,
      textEntities: all.filter((entity) => entity.kind === 'text').length,
      newFields: fieldsOf('new'),
      changedFields: fieldsOf('changed'),
      removedFields: all.reduce((sum, entity) => sum + entity.removedFields.length, 0),
      newRelations: newRelations.size,
      newNotes: newNotes.size,
    },
  }
}

/**
 * O arquivo que vem antes deste na sequencia numerada ("13-…" compara com "12-…").
 * Arquivo sem numero, ou o primeiro, nao tem com quem comparar.
 */
export function previousFile(files: readonly string[], current: string): string | null {
  const numbered = files.filter((name) => /^\d+-/.test(name)).sort()
  const index = numbered.indexOf(current)
  return index > 0 ? numbered[index - 1] ?? null : null
}
