import { memo } from 'react'
import { BaseEdge, useInternalNode, type EdgeProps, type InternalNode } from '@xyflow/react'
import { linkKind } from '../../model/constants'
import { segment, type Box } from '../../model/geometry'
import type { UmlEdgeData, UmlFlowEdge } from './nodeTypes'

/**
 * A linha da UML: reta, de centro a centro, parando na borda de cada ponta.
 *
 * Nao usa a posicao dos pontos de conexao — eles servem so para puxar a linha. O
 * ponto de parada sai do tamanho medido de cada no (`useInternalNode`) e da forma
 * dele: elipse para caso de uso, retangulo para o resto.
 *
 * O que cada tipo desenha:
 * - associacao: linha cheia, sem seta;
 * - inclusao e extensao: tracejada, seta aberta, com «include» ou «extend» no meio;
 * - generalizacao: linha cheia, triangulo vazado no mais geral;
 * - seta da nota: tracejada fina, sem ponta — e anotacao, nao relacao.
 */

function boxOf(node: InternalNode): Box | null {
  const { width, height } = node.measured
  if (!width || !height) return null
  return {
    ...node.internals.positionAbsolute,
    width,
    height,
    shape: node.type === 'useCase' ? 'ellipse' : 'rect',
  }
}

/** Qual ponta desenhar — as definicoes estao em `EdgeMarkers`. */
function markerFor(kind: UmlEdgeData['kind'], selected: boolean): string | undefined {
  const state = selected ? '-selected' : ''
  if (kind === 'include' || kind === 'extend') return `url(#uml-arrow${state})`
  if (kind === 'generalization') return `url(#uml-triangle${state})`
  return undefined
}

function DiagramEdge({ id, source, target, data, selected = false }: EdgeProps<UmlFlowEdge>) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const from = sourceNode ? boxOf(sourceNode) : null
  const to = targetNode ? boxOf(targetNode) : null
  // Antes da primeira medida o no ainda nao tem tamanho; o React Flow redesenha depois.
  if (!from || !to || !data) return null

  const { source: start, target: end } = segment(from, to)
  const keyword = data.kind === 'anchor' ? '' : linkKind(data.kind).keyword

  return (
    <BaseEdge
      id={id}
      path={`M ${start.x},${start.y} L ${end.x},${end.y}`}
      className={`uml-edge uml-edge--${data.kind}`}
      markerEnd={markerFor(data.kind, selected)}
      label={keyword || undefined}
      labelX={(start.x + end.x) / 2}
      labelY={(start.y + end.y) / 2}
      labelBgPadding={[4, 2]}
      labelBgBorderRadius={3}
      interactionWidth={16}
    />
  )
}

export default memo(DiagramEdge)

/**
 * As pontas de seta, definidas uma vez para o canvas inteiro. Uma versao por cor:
 * o conteudo de um `<marker>` herda o estilo de onde foi definido, e nao da linha
 * que o usa — por isso a linha escolhida precisa de uma ponta propria.
 */
export function EdgeMarkers() {
  return (
    <svg className="uml-markers" aria-hidden="true">
      <defs>
        {['', '-selected'].map((state) => (
          <g key={state}>
            <marker
              id={`uml-arrow${state}`}
              className={`uml-marker${state ? ' uml-marker--selected' : ''}`}
              viewBox="0 0 12 12"
              refX="11"
              refY="6"
              markerWidth="12"
              markerHeight="12"
              markerUnits="userSpaceOnUse"
              orient="auto-start-reverse"
            >
              <path d="M 1 1 L 11 6 L 1 11" fill="none" />
            </marker>
            <marker
              id={`uml-triangle${state}`}
              className={`uml-marker uml-marker--hollow${state ? ' uml-marker--selected' : ''}`}
              viewBox="0 0 16 16"
              refX="15"
              refY="8"
              markerWidth="16"
              markerHeight="16"
              markerUnits="userSpaceOnUse"
              orient="auto-start-reverse"
            >
              <path d="M 1 1 L 15 8 L 1 15 Z" />
            </marker>
          </g>
        ))}
      </defs>
    </svg>
  )
}
