import YAML from 'yaml'
import type { Entity, Field, ModelDoc, Note, ParseResult, Position, Relation } from '../types'
import { isRelationKind, newUid, NOTE_DEFAULT_WIDTH } from './constants'
import { withWarnings } from './operations'

/**
 * Le o arquivo .yaml para o estado do editor.
 *
 * Tudo aqui e defensivo de proposito: o arquivo pode ter sido escrito a mao ou por
 * uma IA, entao campo faltando vira valor padrao em vez de quebrar a tela.
 */

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : value == null ? '' : String(value)

const asBool = (value: unknown): boolean => value === true

const asNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

/** Sem posicao no arquivo, distribui em grade para nada nascer empilhado. */
function parsePosition(raw: unknown, index: number): Position {
  const record = asRecord(raw)
  return {
    x: asNumber(record.x, 60 + (index % 3) * 320),
    y: asNumber(record.y, 60 + Math.floor(index / 3) * 260),
  }
}

function parseField(raw: unknown): Field {
  // Aceita a forma curta `fields: [id, name]`, util para rascunho escrito a mao.
  if (typeof raw === 'string') {
    return { uid: newUid('f'), name: raw, type: '', note: '' }
  }
  const record = asRecord(raw)
  return {
    uid: newUid('f'),
    name: asString(record.name),
    type: asString(record.type),
    pk: asBool(record.pk),
    fk: asBool(record.fk),
    required: asBool(record.required),
    unique: asBool(record.unique),
    note: asString(record.note),
  }
}

function parseEntity(raw: unknown, index: number): Entity {
  const record = asRecord(raw)
  return {
    uid: newUid('e'),
    name: asString(record.name) || `Entidade${index + 1}`,
    label: asString(record.label),
    description: asString(record.description),
    position: parsePosition(record.position, index),
    fields: asArray(record.fields).map(parseField),
  }
}

function parseRelation(raw: unknown): Relation {
  const record = asRecord(raw)
  return {
    uid: newUid('r'),
    from: asString(record.from),
    to: asString(record.to),
    kind: isRelationKind(record.kind) ? record.kind : 'one-to-many',
    note: asString(record.note),
    fromField: asString(record.fromField),
    toField: asString(record.toField),
  }
}

function parseNote(raw: unknown, index: number): Note {
  const record = asRecord(raw)
  return {
    uid: newUid('n'),
    text: asString(typeof raw === 'string' ? raw : record.text),
    position: parsePosition(record.position, index + 100),
    width: asNumber(record.width, NOTE_DEFAULT_WIDTH),
    anchor: asString(record.anchor),
    anchorField: asString(record.anchorField),
  }
}

export function parseDoc(text: string): ParseResult {
  let raw: unknown
  try {
    raw = YAML.parse(text ?? '') ?? {}
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'o arquivo precisa começar com um mapa (meta:, entities: …)' }
  }

  const record = raw as Record<string, unknown>
  const meta = asRecord(record.meta)
  const entities = asArray(record.entities).map(parseEntity)
  const relations = asArray(record.relations).map(parseRelation)
  const notes = asArray(record.notes).map(parseNote)

  // Os avisos saem do mesmo lugar que usamos depois de cada edicao — uma regra so.
  const doc: ModelDoc = withWarnings({
    meta: { title: asString(meta.title), description: asString(meta.description) },
    entities,
    relations,
    notes,
    warnings: [],
  })

  return { ok: true, doc }
}

export const emptyDoc = (title: string): ModelDoc => ({
  meta: { title, description: '' },
  entities: [],
  relations: [],
  notes: [],
  warnings: [],
})
