import { Position as FlowPosition, type Node } from '@xyflow/react'
import type { Entity, Note, Side } from '../../types'

/** Ponte entre o modelo e o React Flow: o que cada no carrega e como o id e formado. */

export type EntityNodeData = { entity: Entity }
export type NoteNodeData = { note: Note }

export type EntityFlowNode = Node<EntityNodeData, 'entity'>
export type NoteFlowNode = Node<NoteNodeData, 'note'>
export type AppNode = EntityFlowNode | NoteFlowNode

// O id carrega o tipo junto ("e:e3") para o clique saber o que foi selecionado sem
// precisar procurar em varias listas.
export const nodeId = {
  entity: (uid: string): string => `e:${uid}`,
  note: (uid: string): string => `n:${uid}`,
}

export const edgeId = {
  relation: (uid: string): string => `r:${uid}`,
  anchor: (uid: string): string => `a:${uid}`,
}

export function parseNodeId(id: string): { kind: 'entity' | 'note' | null; uid: string } {
  const [prefix = '', uid = ''] = id.split(':')
  if (prefix === 'e') return { kind: 'entity', uid }
  if (prefix === 'n') return { kind: 'note', uid }
  return { kind: null, uid }
}

export function parseEdgeId(id: string): { kind: 'relation' | 'anchor' | null; uid: string } {
  const [prefix = '', uid = ''] = id.split(':')
  if (prefix === 'r') return { kind: 'relation', uid }
  if (prefix === 'a') return { kind: 'anchor', uid }
  return { kind: null, uid }
}

/**
 * Pontos de conexao. `box:` gruda na borda da caixa; `f:` gruda na altura de uma
 * linha da tabela — o `uid` do campo, e nao o nome, para o ponto sobreviver a
 * renomear e para dois campos sem nome nao colidirem.
 */
export const handleId = {
  box: (side: Side): string => `box:${side}`,
  field: (fieldUid: string, side: Side): string => `f:${fieldUid}:${side}`,
}

export function parseHandleId(id: string | null | undefined): {
  kind: 'box' | 'field' | null
  fieldUid: string
} {
  const parts = (id ?? '').split(':')
  if (parts[0] === 'box') return { kind: 'box', fieldUid: '' }
  if (parts[0] === 'f') return { kind: 'field', fieldUid: parts[1] ?? '' }
  return { kind: null, fieldUid: '' }
}

/** O `Side` do modelo para o enum de posicao do React Flow. */
export const FLOW_POSITION: Record<Side, FlowPosition> = {
  left: FlowPosition.Left,
  right: FlowPosition.Right,
  top: FlowPosition.Top,
  bottom: FlowPosition.Bottom,
}

export const SIDES: readonly Side[] = ['left', 'right', 'top', 'bottom']
