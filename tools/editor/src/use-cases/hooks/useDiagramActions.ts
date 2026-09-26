import { useMemo } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { MeasuredSizes } from '../components/canvas/Board'
import { nodeId } from '../components/canvas/nodeTypes'
import * as ops from '../model/operations'
import { NOTE_DEFAULT_WIDTH, newUid, USE_CASE_DEFAULT_WIDTH } from '../model/constants'
import {
  ACTOR_NAME_HEIGHT, ACTOR_SIZE, freeSpot, NOTE_HEIGHT, occupied, USE_CASE_HEIGHT, type Bounds,
} from '../model/geometry'
import { bound } from '../model/refs'
import type {
  Actor, AlternativeFlow, DocMeta, Note, Position, Selection, UseCase, UseCaseDoc,
} from '../types'

/**
 * Liga as transformacoes puras de `model/operations` ao estado do editor.
 *
 * Alem de aplicar a mudanca, cuida da selecao: quem cria um ator quer edita-lo em
 * seguida, e quem apaga o que estava selecionado nao pode ficar com o painel
 * apontando para algo que sumiu.
 */

export type DiagramActions = {
  setMeta: (patch: Partial<DocMeta>) => void
  addActor: () => void
  updateActor: (uid: string, patch: Partial<Actor>) => void
  deleteActor: (uid: string) => void
  addUseCase: () => void
  updateUseCase: (uid: string, patch: Partial<UseCase>) => void
  deleteUseCase: (uid: string) => void
  addAlternativeFlow: (useCaseUid: string) => void
  updateAlternativeFlow: (useCaseUid: string, flowUid: string, patch: Partial<AlternativeFlow>) => void
  deleteAlternativeFlow: (useCaseUid: string, flowUid: string) => void
  addNote: () => void
  updateNote: (uid: string, patch: Partial<Note>) => void
  deleteNote: (uid: string) => void
  /** Linha puxada no canvas entre dois elementos; o tipo sai das pontas. */
  connect: (fromUid: string, toUid: string) => void
  /** Seta puxada de uma nota ate um ator ou caso de uso. */
  anchorNote: (noteUid: string, targetUid: string) => void
  updateLink: (uid: string, patch: ops.LinkPatch) => void
  reverseLink: (uid: string) => void
  deleteLink: (uid: string) => void
}

type Params = {
  update: (fn: (doc: UseCaseDoc) => UseCaseDoc) => void
  setSelection: Dispatch<SetStateAction<Selection>>
  /** O meio do que esta visivel — o elemento novo nasce ali, e nao fora da tela. */
  visibleCenter: () => Position
  /** O tamanho que o canvas mediu de cada elemento. */
  sizesRef: MutableRefObject<MeasuredSizes>
}

/** A caixa de um elemento novo centrado em `center` — de onde a busca por lugar livre parte. */
const around = (center: Position, width: number, height: number): Bounds => ({
  x: Math.round(center.x - width / 2),
  y: Math.round(center.y - height / 2),
  width,
  height,
})

export function useDiagramActions({ update, setSelection, visibleCenter, sizesRef }: Params): DiagramActions {
  return useMemo<DiagramActions>(() => {
    /** O que ja ocupa lugar, com a medida de verdade quando o canvas ja mediu. */
    const taken = (doc: UseCaseDoc, withBoundary = false) => occupied(doc, {
      withBoundary,
      sizeOf: (kind, uid) => sizesRef.current[nodeId[kind](uid)],
    })

    return {
    setMeta: (patch) => update((doc) => ops.setMeta(doc, patch)),

    addActor: () => {
      const uid = newUid('a')
      const { width, height } = ACTOR_SIZE.person
      const wanted = around(visibleCenter(), width, height + ACTOR_NAME_HEIGHT)
      // A fronteira conta como ocupada: o ator nasce do lado de fora do sistema.
      update((doc) => ops.addActor(doc, uid, freeSpot(wanted, taken(doc, true))))
      setSelection({ type: 'actor', uid })
    },

    updateActor: (uid, patch) => update((doc) => ops.updateActor(doc, uid, patch)),

    deleteActor: (uid) => {
      update((doc) => ops.deleteActor(doc, uid))
      setSelection(null)
    },

    addUseCase: () => {
      const uid = newUid('u')
      const wanted = around(visibleCenter(), USE_CASE_DEFAULT_WIDTH, USE_CASE_HEIGHT)
      update((doc) => ops.addUseCase(doc, uid, freeSpot(wanted, taken(doc))))
      setSelection({ type: 'useCase', uid })
    },

    updateUseCase: (uid, patch) => update((doc) => ops.updateUseCase(doc, uid, patch)),

    deleteUseCase: (uid) => {
      update((doc) => ops.deleteUseCase(doc, uid))
      setSelection(null)
    },

    addAlternativeFlow: (useCaseUid) =>
      update((doc) => ops.addAlternativeFlow(doc, useCaseUid, newUid('f'))),
    updateAlternativeFlow: (useCaseUid, flowUid, patch) =>
      update((doc) => ops.updateAlternativeFlow(doc, useCaseUid, flowUid, patch)),
    deleteAlternativeFlow: (useCaseUid, flowUid) =>
      update((doc) => ops.deleteAlternativeFlow(doc, useCaseUid, flowUid)),

    addNote: () => {
      const uid = newUid('n')
      const wanted = around(visibleCenter(), NOTE_DEFAULT_WIDTH, NOTE_HEIGHT)
      update((doc) => ops.addNote(doc, uid, freeSpot(wanted, taken(doc))))
      setSelection({ type: 'note', uid })
    },

    updateNote: (uid, patch) => update((doc) => ops.updateNote(doc, uid, patch)),

    deleteNote: (uid) => {
      update((doc) => ops.deleteNote(doc, uid))
      setSelection(null)
    },

    connect: (fromUid, toUid) => {
      const uid = newUid('l')
      update((doc) => ops.addLink(doc, uid, fromUid, toUid))
      // Seleciona a ligacao nova para o tipo ser conferido na hora, no painel.
      setSelection({ type: 'link', uid })
    },

    anchorNote: (noteUid, targetUid) => {
      update((doc) => ops.updateNote(doc, noteUid, { anchor: bound(targetUid) }))
      setSelection({ type: 'note', uid: noteUid })
    },

    updateLink: (uid, patch) => update((doc) => ops.updateLink(doc, uid, patch)),
    reverseLink: (uid) => update((doc) => ops.reverseLink(doc, uid)),

    deleteLink: (uid) => {
      update((doc) => ops.deleteLink(doc, uid))
      setSelection(null)
    },
    }
  }, [update, setSelection, visibleCenter, sizesRef])
}
