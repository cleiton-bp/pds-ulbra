import { memo } from 'react'
import type { KeyboardEvent } from 'react'
import { Handle, type NodeProps } from '@xyflow/react'
import Icon from '../../../shared/Icon'
import { useCanvasEditing } from './EditingContext'
import { FLOW_POSITION, SIDES, handleId, type NoteFlowNode } from './nodeTypes'

/** Largura fixa da nota resumida: estreita, para nao cobrir as tabelas em volta. */
const COMPACT_WIDTH = 220

/**
 * Caixa de texto livre: a explicacao que nao cabe numa tabela.
 *
 * Os pontos das laterais servem para puxar uma seta ate a entidade que o texto
 * explica; a ligacao vira o campo `anchor` da nota no arquivo. Clicar escolhe a nota
 * e abre no painel; editando, o clique duplo abre o texto inteiro ali mesmo.
 *
 * Resumida (`compact`), mostra so o comeco do texto numa caixa estreita: o texto
 * inteiro e lido no painel, ao clicar. E o jeito de varias notas caberem no desenho
 * sem cobrir as tabelas: o arquivo continua com a nota do mesmo tamanho.
 */
function NoteNode({ data, selected }: NodeProps<NoteFlowNode>) {
  const { note, dim, compact, fresh, far } = data
  const { actions, locked, inline, startInline, stopInline, lockedAttempt } = useCanvasEditing()
  const isEditing = !locked && inline?.kind === 'note' && inline.uid === note.uid

  const onKeyDown = (event: KeyboardEvent): void => {
    // Enter quebra linha aqui; so Escape fecha.
    if (event.key === 'Escape') {
      event.preventDefault()
      stopInline()
    }
  }

  const onDoubleClick = (): void => {
    if (locked) lockedAttempt()
    else startInline({ kind: 'note', uid: note.uid })
  }

  const className = [
    'note-node',
    selected ? 'is-selected' : '',
    dim ? 'is-dim' : '',
    compact && !isEditing ? 'is-compact' : '',
    isEditing ? 'is-editing' : '',
    far && !isEditing ? 'is-far' : '',
    fresh ? 'is-fresh' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={className}
      // Aberta para edicao, a nota resumida ganha a largura dela: o texto inteiro cabe.
      style={{ width: compact && !isEditing ? COMPACT_WIDTH : Math.max(note.width, 320) }}
      onDoubleClick={onDoubleClick}
    >
      {/* Os quatro lados: a seta sai por onde ficar mais curto para a tabela. */}
      {SIDES.map((side) => (
        <Handle
          key={side}
          type="source"
          id={handleId.box(side)}
          position={FLOW_POSITION[side]}
          className="handle-box"
          isConnectable={!locked}
        />
      ))}

      {isEditing ? (
        <div className="note-node__editing nodrag nopan" onKeyDown={onKeyDown}>
          <textarea
            className="autogrow note-node__input"
            value={note.text}
            placeholder="a explicação que não cabe numa tabela"
            aria-label="texto da nota"
            autoFocus
            onChange={(event) => actions.updateNote(note.uid, { text: event.target.value })}
          />
          <div className="note-node__bar">
            <span>grava sozinho, e Esc fecha</span>
            <button className="inline-done" title="pronto (Esc)" aria-label="pronto" onClick={(event) => { event.stopPropagation(); stopInline() }}>
              <Icon name="check" size={14} />
            </button>
          </div>
        </div>
      ) : compact ? (
        <div className="note-node__compact" title={locked ? 'clique para ler no painel' : 'clique para ler no painel, ou clique duplo para editar aqui'}>
          <span className="note-node__icon"><Icon name="note" size={13} /></span>
          <p className="note-node__text">{note.text || 'nota vazia'}</p>
          {fresh && <span className="tag tag--new">nova</span>}
        </div>
      ) : (
        <div title={locked ? 'clique para ler no painel' : 'clique para ler no painel, ou clique duplo para editar aqui'}>
          {fresh && <span className="tag tag--new note-node__tag">nova</span>}
          {note.text
            ? <p className="note-node__text">{note.text}</p>
            : <p className="note-node__empty">nota vazia, clique duplo para escrever</p>}
        </div>
      )}
    </div>
  )
}

export default memo(NoteNode)
