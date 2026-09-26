import { createContext, useContext } from 'react'
import type { DiagramActions } from '../../hooks/useDiagramActions'
import type { NodeKind } from './nodeTypes'

/**
 * Os elementos do canvas precisam editar o modelo direto, sem passar pelo painel —
 * senao fechar o painel deixaria a tela sem como escrever um nome.
 *
 * Vai por contexto e nao pelo `data` do no: o React Flow recria o objeto de dados a
 * cada mudanca do documento, e enfiar callback ali dentro faria todo elemento da
 * tela re-renderizar a cada tecla digitada em qualquer um deles.
 */

/** Qual elemento esta com o texto aberto para edicao, direto no canvas. */
export type Editing = { kind: NodeKind; uid: string } | null

export type CanvasEditing = {
  actions: DiagramActions
  editing: Editing
  edit: (kind: NodeKind, uid: string) => void
  stopEditing: () => void
}

const Context = createContext<CanvasEditing | null>(null)

export const CanvasEditingProvider = Context.Provider

export function useCanvasEditing(): CanvasEditing {
  const value = useContext(Context)
  if (!value) throw new Error('useCanvasEditing precisa estar dentro de CanvasEditingProvider')
  return value
}

/** Enter confirma e Escape fecha — nos dois casos a edicao termina. */
export const closesOn = (key: string, shift: boolean): boolean =>
  key === 'Escape' || (key === 'Enter' && !shift)
