import { useMemo } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import * as ops from '../model/operations'
import { newUid } from '../model/constants'
import type { DocMeta, Entity, Field, ModelDoc, Note, Position, Relation, Selection } from '../types'

/**
 * Liga as transformacoes puras de `model/operations` ao estado do editor.
 *
 * Alem de aplicar a mudanca, cuida da selecao: quem cria uma entidade quer edita-la
 * em seguida, e quem apaga a que estava selecionada nao pode ficar com o painel
 * apontando para algo que sumiu.
 */

export type ModelActions = {
  setMeta: (patch: Partial<DocMeta>) => void
  addEntity: () => void
  updateEntity: (uid: string, patch: Partial<Entity>) => void
  renameEntity: (uid: string, name: string) => void
  deleteEntity: (uid: string) => void
  addField: (entityUid: string) => void
  updateField: (entityUid: string, fieldUid: string, patch: Partial<Field>) => void
  deleteField: (entityUid: string, fieldUid: string) => void
  moveField: (entityUid: string, from: number, to: number) => void
  moveEntity: (uid: string, position: Position) => void
  addNote: () => void
  updateNote: (uid: string, patch: Partial<Note>) => void
  deleteNote: (uid: string) => void
  addRelation: (from: string, to: string, fromField?: string, toField?: string) => void
  updateRelation: (uid: string, patch: Partial<Relation>) => void
  deleteRelation: (uid: string) => void
}

type Params = {
  update: (fn: (doc: ModelDoc) => ModelDoc) => void
  setSelection: Dispatch<SetStateAction<Selection>>
  /** Onde colocar uma caixa nova — no meio do que está visível, nao fora da tela. */
  nextPosition: () => Position
}

export function useModelActions({ update, setSelection, nextPosition }: Params): ModelActions {
  return useMemo<ModelActions>(() => ({
    setMeta: (patch) => update((doc) => ops.setMeta(doc, patch)),

    addEntity: () => {
      const uid = newUid('e')
      update((doc) => ops.addEntity(doc, uid, nextPosition()))
      setSelection({ type: 'entity', uid })
    },

    updateEntity: (uid, patch) => update((doc) => ops.updateEntity(doc, uid, patch)),
    renameEntity: (uid, name) => update((doc) => ops.renameEntity(doc, uid, name)),

    deleteEntity: (uid) => {
      update((doc) => ops.deleteEntity(doc, uid))
      setSelection(null)
    },

    addField: (entityUid) => update((doc) => ops.addField(doc, entityUid)),
    updateField: (entityUid, fieldUid, patch) =>
      update((doc) => ops.updateField(doc, entityUid, fieldUid, patch)),
    deleteField: (entityUid, fieldUid) =>
      update((doc) => ops.deleteField(doc, entityUid, fieldUid)),
    moveField: (entityUid, from, to) => update((doc) => ops.moveField(doc, entityUid, from, to)),
    moveEntity: (uid, position) => update((doc) => ops.moveEntity(doc, uid, position)),

    addNote: () => {
      const uid = newUid('n')
      update((doc) => ops.addNote(doc, uid, nextPosition()))
      setSelection({ type: 'note', uid })
    },

    updateNote: (uid, patch) => update((doc) => ops.updateNote(doc, uid, patch)),

    deleteNote: (uid) => {
      update((doc) => ops.deleteNote(doc, uid))
      setSelection(null)
    },

    addRelation: (from, to, fromField = '', toField = '') => {
      const uid = newUid('r')
      update((doc) => ops.addRelation(doc, uid, from, to, fromField, toField))
      // Seleciona a relacao nova para a cardinalidade ser escolhida na hora.
      setSelection({ type: 'relation', uid })
    },

    updateRelation: (uid, patch) => update((doc) => ops.updateRelation(doc, uid, patch)),

    deleteRelation: (uid) => {
      update((doc) => ops.deleteRelation(doc, uid))
      setSelection(null)
    },
  }), [update, setSelection, nextPosition])
}
