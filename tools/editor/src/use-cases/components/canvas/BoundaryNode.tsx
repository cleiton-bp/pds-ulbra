import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { BoundaryFlowNode } from './nodeTypes'

/**
 * A fronteira do sistema: o retangulo com o nome dele em cima.
 *
 * Nao se arrasta nem se escolhe — acompanha os casos de uso sozinha (ver
 * `systemBounds`). Fica atras de tudo e deixa o clique passar, entao clicar dentro
 * dela e o mesmo que clicar no fundo do canvas.
 */
function BoundaryNode({ data }: NodeProps<BoundaryFlowNode>) {
  return (
    <div className="boundary-node" style={{ width: data.width, height: data.height }}>
      {data.title && <span className="boundary-node__title">{data.title}</span>}
    </div>
  )
}

export default memo(BoundaryNode)
