import { memo } from 'react'
import type { KeyboardEvent } from 'react'
import type { NodeProps } from '@xyflow/react'
import { ACTOR_SIZE } from '../../model/geometry'
import { closesOn, useCanvasEditing } from './EditingContext'
import Handles from './Handles'
import type { ActorFlowNode } from './nodeTypes'

/** O boneco da UML, no tamanho exato da caixa do ator — ver `ACTOR_SIZE`. */
function StickFigure() {
  const { width, height } = ACTOR_SIZE.person
  return (
    <svg className="actor-node__figure" viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
      <circle cx="22" cy="11" r="9" />
      <line x1="22" y1="20" x2="22" y2="46" />
      <line x1="4" y1="30" x2="40" y2="30" />
      <line x1="22" y1="46" x2="7" y2="70" />
      <line x1="22" y1="46" x2="37" y2="70" />
    </svg>
  )
}

/**
 * O ator no canvas: boneco para pessoa, caixa com «sistema» para sistema externo.
 *
 * No boneco o nome fica embaixo, dentro da altura da caixa do no mas fora da
 * largura dela. A linha que chega de lado encosta no boneco, em vez de parar no ar
 * ao lado de um nome comprido; a que chega de baixo para no nome, em vez de
 * atravessa-lo. Clique duplo abre o nome para edicao ali mesmo.
 */
function ActorNode({ data, selected }: NodeProps<ActorFlowNode>) {
  const { actor, dim } = data
  const { actions, editing, edit, stopEditing } = useCanvasEditing()
  const isEditing = editing?.kind === 'actor' && editing.uid === actor.uid
  const size = ACTOR_SIZE[actor.kind]

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!closesOn(event.key, event.shiftKey)) return
    event.preventDefault()
    stopEditing()
  }

  const name = isEditing ? (
    <input
      className="actor-node__input nodrag nopan"
      value={actor.name}
      placeholder="nome do ator"
      autoFocus
      onKeyDown={onKeyDown}
      onChange={(event) => actions.updateActor(actor.uid, { name: event.target.value })}
    />
  ) : (
    <span>{actor.name || <em>sem nome</em>}</span>
  )

  return (
    <div
      className={`actor-node actor-node--${actor.kind}${selected ? ' is-selected' : ''}${dim ? ' is-dim' : ''}`}
      // A pessoa cresce para baixo junto com o nome; o sistema tem a caixa fechada.
      style={actor.kind === 'system' ? { width: size.width, height: size.height } : { width: size.width }}
      title={actor.description || undefined}
      onDoubleClick={() => edit('actor', actor.uid)}
    >
      <Handles />
      {actor.kind === 'system' ? (
        <div className="actor-node__system">
          <small>«sistema»</small>
          {name}
        </div>
      ) : (
        <>
          <StickFigure />
          <div className="actor-node__name">{name}</div>
        </>
      )}
    </div>
  )
}

export default memo(ActorNode)
