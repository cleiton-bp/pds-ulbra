import { memo } from 'react'
import type { KeyboardEvent } from 'react'
import type { NodeProps } from '@xyflow/react'
import { useCanvasEditing } from './EditingContext'
import Handles from './Handles'
import type { NoteFlowNode } from './nodeTypes'

/**
 * Caixa de texto livre — a explicacao que nao cabe no desenho.
 *
 * Os pontos das laterais servem para puxar a ligacao ate o ator ou o caso de uso
 * que o texto explica; ela vira o campo `anchor` da nota no arquivo.
 */
function NoteNode({ data, selected }: NodeProps<NoteFlowNode>) {
  const { note, dim } = data
  const { actions, editing, edit, stopEditing } = useCanvasEditing()
  const isEditing = editing?.kind === 'note' && editing.uid === note.uid

  const onKeyDown = (event: KeyboardEvent): void => {
    // Enter quebra linha aqui; so Escape fecha.
    if (event.key === 'Escape') {
      event.preventDefault()
      stopEditing()
    }
  }

  return (
    <div
      className={`note-node${selected ? ' is-selected' : ''}${dim ? ' is-dim' : ''}`}
      style={{ width: note.width }}
    >
      <Handles />

      {isEditing ? (
        <div className="nodrag nopan" onKeyDown={onKeyDown}>
          <textarea
            className="note-node__input"
            value={note.text}
            placeholder="a explicação que não cabe no desenho"
            rows={6}
            autoFocus
            onChange={(event) => actions.updateNote(note.uid, { text: event.target.value })}
          />
          <button className="note-node__done" onClick={stopEditing}>pronto</button>
        </div>
      ) : (
        <div className="nodrag" onClick={() => edit('note', note.uid)}>
          {note.text
            ? <p className="note-node__text">{note.text}</p>
            : <p className="note-node__empty">nota vazia — clique para escrever</p>}
        </div>
      )}
    </div>
  )
}

export default memo(NoteNode)
