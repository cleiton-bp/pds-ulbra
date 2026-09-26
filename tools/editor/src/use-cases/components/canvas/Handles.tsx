import { Handle } from '@xyflow/react'
import { FLOW_POSITION, SIDES, handleId } from './nodeTypes'

/**
 * Os quatro pontos de onde se puxa uma linha nova. Somem ate o mouse chegar no
 * elemento: um boneco coberto de bolinhas deixaria de parecer um boneco.
 */
export default function Handles() {
  return (
    <>
      {SIDES.map((side) => (
        <Handle
          key={side}
          type="source"
          id={handleId(side)}
          position={FLOW_POSITION[side]}
          className="handle-box"
        />
      ))}
    </>
  )
}
