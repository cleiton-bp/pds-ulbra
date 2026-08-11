import type { Entity, Field, ModelDoc, Note, Relation } from '../types'
import { newUid, NOTE_DEFAULT_WIDTH } from './constants'

/**
 * Transformacoes puras sobre o documento. Nenhuma toca em React ou em rede —
 * recebem um doc e devolvem outro, o que as torna faceis de conferir e testar.
 */

const replaceEntity = (doc: ModelDoc, uid: string, fn: (entity: Entity) => Entity): ModelDoc => ({
  ...doc,
  entities: doc.entities.map((e) => (e.uid === uid ? fn(e) : e)),
})

export const setMeta = (doc: ModelDoc, patch: Partial<ModelDoc['meta']>): ModelDoc => ({
  ...doc,
  meta: { ...doc.meta, ...patch },
})

/** Sugere um nome livre: Entidade, Entidade2, Entidade3… */
export function suggestEntityName(doc: ModelDoc, base = 'Entidade'): string {
  const taken = new Set(doc.entities.map((e) => e.name))
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}${i}`)) i += 1
  return `${base}${i}`
}

export function addEntity(doc: ModelDoc, uid: string, position: Entity['position']): ModelDoc {
  const entity: Entity = {
    uid,
    name: suggestEntityName(doc),
    label: '',
    description: '',
    position,
    fields: [{ uid: newUid('f'), name: 'id', type: 'int', pk: true, note: '' }],
  }
  return { ...doc, entities: [...doc.entities, entity] }
}

export const updateEntity = (doc: ModelDoc, uid: string, patch: Partial<Entity>): ModelDoc =>
  replaceEntity(doc, uid, (e) => ({ ...e, ...patch }))

/**
 * Renomear leva junto as relacoes e as setas de nota que citavam o nome antigo.
 * Sem isso, renomear uma entidade quebraria toda linha ligada a ela — o preco de
 * referenciar por nome em vez de por id.
 */
export function renameEntity(doc: ModelDoc, uid: string, nextName: string): ModelDoc {
  const target = doc.entities.find((e) => e.uid === uid)
  if (!target) return doc
  const previous = target.name
  return {
    ...doc,
    entities: doc.entities.map((e) => (e.uid === uid ? { ...e, name: nextName } : e)),
    relations: doc.relations.map((r) => ({
      ...r,
      from: r.from === previous ? nextName : r.from,
      to: r.to === previous ? nextName : r.to,
    })),
    notes: doc.notes.map((n) => (n.anchor === previous ? { ...n, anchor: nextName } : n)),
  }
}

/**
 * Apaga a entidade, as relacoes dela e as setas que apontavam para ela.
 * A nota em si fica: o texto continua valendo mesmo sem a caixa que ele explicava.
 */
export function deleteEntity(doc: ModelDoc, uid: string): ModelDoc {
  const target = doc.entities.find((e) => e.uid === uid)
  if (!target) return doc
  return {
    ...doc,
    entities: doc.entities.filter((e) => e.uid !== uid),
    relations: doc.relations.filter((r) => r.from !== target.name && r.to !== target.name),
    notes: doc.notes.map((n) => (n.anchor === target.name ? { ...n, anchor: '' } : n)),
  }
}

export const moveEntity = (doc: ModelDoc, uid: string, position: Entity['position']): ModelDoc =>
  replaceEntity(doc, uid, (e) => ({ ...e, position }))

export const addField = (doc: ModelDoc, entityUid: string): ModelDoc =>
  replaceEntity(doc, entityUid, (e) => ({
    ...e,
    fields: [...e.fields, { uid: newUid('f'), name: '', type: '', note: '' }],
  }))

/**
 * Troca o nome de um campo em toda linha que grudava nele.
 * Sem isto, renomear `account_id` largaria a relação apontando para um campo que
 * nao existe mais — e a linha pularia de volta para a borda da caixa sem aviso.
 */
function renameFieldRefs(
  doc: ModelDoc,
  entityName: string,
  previous: string,
  next: string,
): ModelDoc {
  return {
    ...doc,
    relations: doc.relations.map((r) => ({
      ...r,
      fromField: r.from === entityName && r.fromField === previous ? next : r.fromField,
      toField: r.to === entityName && r.toField === previous ? next : r.toField,
    })),
    notes: doc.notes.map((n) => (
      n.anchor === entityName && n.anchorField === previous ? { ...n, anchorField: next } : n
    )),
  }
}

export function updateField(
  doc: ModelDoc,
  entityUid: string,
  fieldUid: string,
  patch: Partial<Field>,
): ModelDoc {
  const entity = doc.entities.find((e) => e.uid === entityUid)
  const field = entity?.fields.find((f) => f.uid === fieldUid)
  if (!entity || !field) return doc

  const updated = replaceEntity(doc, entityUid, (e) => ({
    ...e,
    fields: e.fields.map((f) => (f.uid === fieldUid ? { ...f, ...patch } : f)),
  }))

  const renamed = patch.name !== undefined && patch.name !== field.name
  return renamed ? renameFieldRefs(updated, entity.name, field.name, patch.name ?? '') : updated
}

/** Apagar o campo solta as linhas que grudavam nele — elas voltam para a borda da caixa. */
export function deleteField(doc: ModelDoc, entityUid: string, fieldUid: string): ModelDoc {
  const entity = doc.entities.find((e) => e.uid === entityUid)
  const field = entity?.fields.find((f) => f.uid === fieldUid)
  if (!entity || !field) return doc

  const removed = replaceEntity(doc, entityUid, (e) => ({
    ...e,
    fields: e.fields.filter((f) => f.uid !== fieldUid),
  }))

  return renameFieldRefs(removed, entity.name, field.name, '')
}

export const moveField = (doc: ModelDoc, entityUid: string, from: number, to: number): ModelDoc =>
  replaceEntity(doc, entityUid, (e) => {
    const fields = [...e.fields]
    const [moved] = fields.splice(from, 1)
    if (!moved) return e
    fields.splice(to, 0, moved)
    return { ...e, fields }
  })

export function addNote(doc: ModelDoc, uid: string, position: Note['position']): ModelDoc {
  const note: Note = {
    uid, text: '', position, width: NOTE_DEFAULT_WIDTH, anchor: '', anchorField: '',
  }
  return { ...doc, notes: [...doc.notes, note] }
}

export const updateNote = (doc: ModelDoc, uid: string, patch: Partial<Note>): ModelDoc => ({
  ...doc,
  notes: doc.notes.map((n) => (n.uid === uid ? { ...n, ...patch } : n)),
})

export const deleteNote = (doc: ModelDoc, uid: string): ModelDoc => ({
  ...doc,
  notes: doc.notes.filter((n) => n.uid !== uid),
})

/**
 * Ignora auto-relacao e par repetido — os dois so gerariam linha inutil no canvas.
 * `fromField`/`toField` chegam preenchidos quando a linha foi puxada de uma linha
 * da tabela, e vazios quando foi puxada da borda da caixa.
 */
export function addRelation(
  doc: ModelDoc,
  uid: string,
  from: string,
  to: string,
  fromField = '',
  toField = '',
): ModelDoc {
  if (from === to) return doc
  const duplicate = doc.relations.some((r) =>
    r.from === from && r.to === to && r.fromField === fromField && r.toField === toField)
  if (duplicate) return doc
  const relation: Relation = { uid, from, to, kind: 'one-to-many', note: '', fromField, toField }
  return { ...doc, relations: [...doc.relations, relation] }
}

export const updateRelation = (doc: ModelDoc, uid: string, patch: Partial<Relation>): ModelDoc => ({
  ...doc,
  relations: doc.relations.map((r) => (r.uid === uid ? { ...r, ...patch } : r)),
})

export const deleteRelation = (doc: ModelDoc, uid: string): ModelDoc => ({
  ...doc,
  relations: doc.relations.filter((r) => r.uid !== uid),
})

/**
 * Recalcula os avisos: referencia orfa vira aviso, nunca exclusao silenciosa.
 * Roda na abertura do arquivo e depois de cada edicao — uma regra so para os dois.
 */
export function withWarnings(doc: ModelDoc): ModelDoc {
  const fieldsOf = new Map(doc.entities.map((e) => [e.name, new Set(e.fields.map((f) => f.name))]))
  const has = (entity: string, field: string): boolean => Boolean(fieldsOf.get(entity)?.has(field))

  const warnings: string[] = []

  for (const r of doc.relations) {
    if (!fieldsOf.has(r.from) || !fieldsOf.has(r.to)) {
      warnings.push(`relação ${r.from || '?'} → ${r.to || '?'} aponta para entidade que não existe`)
      continue
    }
    if (r.fromField && !has(r.from, r.fromField)) {
      warnings.push(`relação ${r.from} → ${r.to} sai do campo "${r.fromField}", que não existe`)
    }
    if (r.toField && !has(r.to, r.toField)) {
      warnings.push(`relação ${r.from} → ${r.to} chega no campo "${r.toField}", que não existe`)
    }
  }

  for (const n of doc.notes) {
    if (!n.anchor) continue
    if (!fieldsOf.has(n.anchor)) {
      warnings.push(`nota aponta para "${n.anchor}", que não existe`)
    } else if (n.anchorField && !has(n.anchor, n.anchorField)) {
      warnings.push(`nota aponta para o campo "${n.anchorField}", que não existe em ${n.anchor}`)
    }
  }

  return { ...doc, warnings }
}
