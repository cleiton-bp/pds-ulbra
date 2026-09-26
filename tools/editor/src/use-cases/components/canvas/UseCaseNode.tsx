import { memo } from 'react'
import type { KeyboardEvent } from 'react'
import type { NodeProps } from '@xyflow/react'
import { USE_CASE_HEIGHT } from '../../model/geometry'
import { closesOn, useCanvasEditing } from './EditingContext'
import Handles from './Handles'
import type { UseCaseFlowNode } from './nodeTypes'

/**
 * A elipse do caso de uso: o codigo em cima, pequeno, e a acao no meio.
 *
 * O tamanho vem do modelo, e nao do texto: e o mesmo numero que a fronteira do
 * sistema usa para se desenhar em volta. Nome que nao cabe em tres linhas e
 * cortado — o inteiro aparece ao parar o mouse, e alargar a elipse fica no painel.
 */
function UseCaseNode({ data, selected }: NodeProps<UseCaseFlowNode>) {
  const { useCase, dim } = data
  const { actions, editing, edit, stopEditing } = useCanvasEditing()
  const isEditing = editing?.kind === 'useCase' && editing.uid === useCase.uid

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!closesOn(event.key, event.shiftKey)) return
    event.preventDefault()
    stopEditing()
  }

  const tooltip = [useCase.name, useCase.description].filter(Boolean).join('\n\n')

  return (
    <div
      className={`use-case-node${selected ? ' is-selected' : ''}${dim ? ' is-dim' : ''}`}
      style={{ width: useCase.width, height: USE_CASE_HEIGHT }}
      title={tooltip || undefined}
      onDoubleClick={() => edit('useCase', useCase.uid)}
    >
      <Handles />
      <span className="use-case-node__id">{useCase.id || 'sem código'}</span>
      {isEditing ? (
        <textarea
          className="use-case-node__input nodrag nopan"
          value={useCase.name}
          placeholder="o que o ator faz"
          rows={2}
          autoFocus
          onKeyDown={onKeyDown}
          onChange={(event) => actions.updateUseCase(useCase.uid, { name: event.target.value })}
        />
      ) : (
        <span className="use-case-node__name">{useCase.name || <em>sem nome</em>}</span>
      )}
    </div>
  )
}

export default memo(UseCaseNode)
