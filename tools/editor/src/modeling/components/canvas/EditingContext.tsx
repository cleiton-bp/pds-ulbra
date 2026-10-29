import { createContext, useContext } from 'react'
import type { ModelActions } from '../../hooks/useModelActions'

/**
 * O que as caixas do canvas precisam alem dos proprios dados: se a tela esta em
 * leitura, o que esta aberto para edicao ali mesmo, e para onde mandar os cliques.
 *
 * Clique abre no painel (a coluna, a nota); clique duplo edita no proprio desenho
 * o que cabe nele: o nome e o tipo da coluna, o texto da nota. O resto (bandeiras,
 * observacao, sobre o que a nota fala) fica no painel, que tem espaco.
 *
 * Vai por contexto e nao pelo `data` do no: o React Flow recria o objeto de dados a
 * cada mudanca do documento, e enfiar callback ali dentro faria toda caixa da tela
 * re-renderizar a cada tecla digitada.
 */

/** O que esta aberto para edicao no proprio desenho. */
export type InlineEditing =
  | { kind: 'field'; entityUid: string; fieldUid: string }
  | { kind: 'note'; uid: string }
  | null

export type CanvasEditing = {
  actions: ModelActions
  /** Tela em "Leitura": nada se edita nem se arrasta no canvas. */
  locked: boolean
  inline: InlineEditing
  /** Clique duplo: abre a coluna ou a nota para edicao no desenho. */
  startInline: (target: Exclude<InlineEditing, null>) => void
  stopInline: () => void
  /** Clique duplo em leitura: a tela diz por que nao editou, e oferece editar. */
  lockedAttempt: () => void
  /** Clique na coluna: escolhe a tabela e mostra a coluna no painel. */
  editField: (entityUid: string, fieldUid: string) => void
  /** O marcador de notas da tabela: escolhe a tabela e abre as notas dela no painel. */
  showEntityNotes: (entityUid: string) => void
}

const Context = createContext<CanvasEditing | null>(null)

export const CanvasEditingProvider = Context.Provider

export function useCanvasEditing(): CanvasEditing {
  const value = useContext(Context)
  if (!value) throw new Error('useCanvasEditing precisa estar dentro de CanvasEditingProvider')
  return value
}
