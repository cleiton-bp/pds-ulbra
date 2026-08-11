import { createContext, useContext } from 'react'
import type { ModelActions } from '../../hooks/useModelActions'

/**
 * As caixas do canvas precisam editar o modelo direto, sem passar pelo painel —
 * senao fechar o painel deixaria metade da tela sem como editar.
 *
 * Vai por contexto e nao pelo `data` do no: o React Flow recria o objeto de dados a
 * cada mudanca do documento, e enfiar callback ali dentro faria toda caixa da tela
 * re-renderizar a cada tecla digitada em qualquer uma delas.
 */

export type Editing =
  | { kind: 'field'; entityUid: string; fieldUid: string }
  | { kind: 'note'; uid: string }
  | null

export type CanvasEditing = {
  actions: ModelActions
  editing: Editing
  editField: (entityUid: string, fieldUid: string) => void
  editNote: (uid: string) => void
  stopEditing: () => void
}

const Context = createContext<CanvasEditing | null>(null)

export const CanvasEditingProvider = Context.Provider

export function useCanvasEditing(): CanvasEditing {
  const value = useContext(Context)
  if (!value) throw new Error('useCanvasEditing precisa estar dentro de CanvasEditingProvider')
  return value
}
