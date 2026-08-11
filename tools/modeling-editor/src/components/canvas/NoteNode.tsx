import { memo } from 'react'
import type { KeyboardEvent } from 'react'
import { Handle, type NodeProps } from '@xyflow/react'
import { useCanvasEditing } from './EditingContext'
import { FLOW_POSITION, SIDES, handleId, type NoteFlowNode } from './nodeTypes'

/**
 * Caixa de texto livre — a explicacao que nao cabe numa tabela.
 *
 * Os pontos das laterais servem para puxar uma seta ate a entidade que o texto
 * explica; a ligacao vira o campo `anchor` da nota no arquivo.
 */
function NoteNode({ data, selected }: NodeProps<NoteFlowNode>) {
  const { note } = data
  const { actions, editing, editNote, stopEditing } = useCanvasEditing()
  const isEditing = editing?.kind === 'note' && editing.uid === note.uid

  const onKeyDown = (event: KeyboardEvent): void => {
    // Enter quebra linha aqui; so Escape fecha.
    if (event.key === 'Escape') {
      event.preventDefault()
      stopEditing()
    }
  }

  return (
    <div className={`note-node${selected ? ' is-selected' : ''}`} style={{ width: note.width }}>
      {/* Os quatro lados: a seta sai por onde ficar mais curto para a tabela. */}
      {SIDES.map((side) => (
        <Handle
          key={side}
          type="source"
          id={handleId.box(side)}
          position={FLOW_POSITION[side]}
          className="handle-box"
        />
      ))}

      {isEditing ? (
        <div className="nodrag nopan" onKeyDown={onKeyDown}>
          <textarea
            className="note-node__input"
            value={note.text}
            placeholder="a explicação que não cabe numa tabela"
            rows={6}
            autoFocus
            onChange={(event) => actions.updateNote(note.uid, { text: event.target.value })}
          />
          <button className="note-node__done" onClick={stopEditing}>pronto</button>
        </div>
      ) : (
        <div className="nodrag" onClick={() => editNote(note.uid)}>
          {note.text
            ? <p className="note-node__text">{note.text}</p>
            : <p className="note-node__empty">nota vazia — clique para escrever</p>}
        </div>
      )}
    </div>
  )
}

export default memo(NoteNode)
