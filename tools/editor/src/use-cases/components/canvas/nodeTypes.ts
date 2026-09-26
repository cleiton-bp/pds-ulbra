import { Position as FlowPosition, type Edge, type Node } from '@xyflow/react'
import type { Actor, LinkKind, Note, UseCase } from '../../types'

/** Ponte entre o modelo e o React Flow: o que cada no carrega e como o id e formado. */

/** `dim` apaga o elemento quando o realce esta ligado e ele fica de fora. */
export type ActorNodeData = { actor: Actor; dim: boolean }
export type UseCaseNodeData = { useCase: UseCase; dim: boolean }
export type NoteNodeData = { note: Note; dim: boolean }
/** A fronteira nao e do arquivo: e calculada em volta dos casos de uso. */
export type BoundaryNodeData = { title: string; width: number; height: number }

export type ActorFlowNode = Node<ActorNodeData, 'actor'>
export type UseCaseFlowNode = Node<UseCaseNodeData, 'useCase'>
export type NoteFlowNode = Node<NoteNodeData, 'note'>
export type BoundaryFlowNode = Node<BoundaryNodeData, 'boundary'>
export type AppNode = ActorFlowNode | UseCaseFlowNode | NoteFlowNode | BoundaryFlowNode

/** `anchor` e a seta da nota; o resto sao os quatro tipos de ligacao da UML. */
export type UmlEdgeData = { kind: LinkKind | 'anchor' }
export type UmlFlowEdge = Edge<UmlEdgeData, 'uml'>

export type NodeKind = 'actor' | 'useCase' | 'note'

// O id carrega o tipo junto ("a:a3") para o clique saber o que foi selecionado sem
// precisar procurar em varias listas.
export const nodeId = {
  actor: (uid: string): string => `a:${uid}`,
  useCase: (uid: string): string => `u:${uid}`,
  note: (uid: string): string => `n:${uid}`,
  boundary: 'boundary',
}

const NODE_PREFIX: Record<string, NodeKind> = { a: 'actor', u: 'useCase', n: 'note' }

export function parseNodeId(id: string): { kind: NodeKind | null; uid: string } {
  const [prefix = '', uid = ''] = id.split(':')
  return { kind: NODE_PREFIX[prefix] ?? null, uid }
}

export const edgeId = {
  link: (uid: string): string => `l:${uid}`,
  anchor: (uid: string): string => `k:${uid}`,
}

export function parseEdgeId(id: string): { kind: 'link' | 'anchor' | null; uid: string } {
  const [prefix = '', uid = ''] = id.split(':')
  if (prefix === 'l') return { kind: 'link', uid }
  if (prefix === 'k') return { kind: 'anchor', uid }
  return { kind: null, uid }
}

export type Side = 'left' | 'right' | 'top' | 'bottom'

export const SIDES: readonly Side[] = ['left', 'right', 'top', 'bottom']

/**
 * Pontos de conexao. Servem so para puxar uma linha nova: a linha desenhada nao
 * sai deles, e sim do centro, parando na borda — ver `DiagramEdge`.
 */
export const handleId = (side: Side): string => `box:${side}`

/** O `Side` do modelo para o enum de posicao do React Flow. */
export const FLOW_POSITION: Record<Side, FlowPosition> = {
  left: FlowPosition.Left,
  right: FlowPosition.Right,
  top: FlowPosition.Top,
  bottom: FlowPosition.Bottom,
}
