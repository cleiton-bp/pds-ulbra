import YAML from 'yaml'
import type { Entity, Field, ModelDoc, Note, Relation } from '../types'
import { NOTE_DEFAULT_WIDTH } from './constants'

/**
 * Escreve o estado do editor de volta no arquivo.
 *
 * Regra que vale para tudo aqui: campo vazio nao vai para o yaml. O diff do git
 * mostra so o que existe de verdade, em vez de dezenas de `note: ""`.
 */

type PlainField = Record<string, string | boolean>
type PlainEntity = Record<string, unknown>

function cleanField(field: Field): PlainField {
  const out: PlainField = { name: field.name }
  if (field.type) out.type = field.type
  if (field.pk) out.pk = true
  if (field.fk) out.fk = true
  if (field.required) out.required = true
  if (field.unique) out.unique = true
  if (field.note) out.note = field.note
  return out
}

function cleanEntity(entity: Entity): PlainEntity {
  const out: PlainEntity = { name: entity.name }
  if (entity.label) out.label = entity.label
  if (entity.description) out.description = entity.description
  out.position = { x: Math.round(entity.position.x), y: Math.round(entity.position.y) }
  out.fields = entity.fields.map(cleanField)
  return out
}

function cleanRelation(relation: Relation): Record<string, unknown> {
  const out: Record<string, unknown> = { from: relation.from }
  if (relation.fromField) out.fromField = relation.fromField
  out.to = relation.to
  if (relation.toField) out.toField = relation.toField
  out.kind = relation.kind
  if (relation.note) out.note = relation.note
  return out
}

function cleanNote(note: Note): Record<string, unknown> {
  const out: Record<string, unknown> = { text: note.text }
  if (note.anchor) out.anchor = note.anchor
  if (note.anchor && note.anchorField) out.anchorField = note.anchorField
  out.position = { x: Math.round(note.position.x), y: Math.round(note.position.y) }
  if (note.width && note.width !== NOTE_DEFAULT_WIDTH) out.width = Math.round(note.width)
  return out
}

export function serializeDoc(doc: ModelDoc): string {
  const plain: Record<string, unknown> = {}

  const meta: Record<string, string> = {}
  if (doc.meta.title) meta.title = doc.meta.title
  if (doc.meta.description) meta.description = doc.meta.description
  if (Object.keys(meta).length > 0) plain.meta = meta

  plain.entities = doc.entities.map(cleanEntity)
  if (doc.relations.length > 0) plain.relations = doc.relations.map(cleanRelation)
  if (doc.notes.length > 0) plain.notes = doc.notes.map(cleanNote)

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
