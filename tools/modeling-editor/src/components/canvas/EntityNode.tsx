import { memo, useEffect } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { Handle, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import { FIELD_FLAGS } from '../../model/constants'
import type { Field } from '../../types'
import { useCanvasEditing } from './EditingContext'
import { FLOW_POSITION, SIDES, handleId, type EntityFlowNode } from './nodeTypes'

/**
 * A caixa de tabela no canvas.
 *
 * Cada linha carrega dois pontos de conexao (esquerda e direita), entao a relacao
 * pode grudar no campo certo em vez de na borda — FK apontando para PK, como num
 * diagrama de banco. A borda da caixa tem os quatro lados, para quem quer ligar a
 * tabela inteira.
 *
 * A lista de campos leva `nodrag` porque clicar numa linha abre a edicao ali mesmo;
 * sem isso o clique viraria arrasto e nunca chegaria no input.
 */
function EntityNode({ id, data, selected }: NodeProps<EntityFlowNode>) {
  const { entity } = data
  const { actions, editing, editField, stopEditing } = useCanvasEditing()

  const editingUid = editing?.kind === 'field' && editing.entityUid === entity.uid
    ? editing.fieldUid
    : ''

  // O React Flow mede onde cada ponto de conexao esta uma vez. Toda mudanca que mexe
  // na altura das linhas — campo criado, removido, ou aberto para edicao — precisa
  // avisar, senao a linha continua grudada na altura antiga.
  const updateNodeInternals = useUpdateNodeInternals()
  const layoutKey = `${entity.fields.map((f) => f.uid).join(',')}|${editingUid}|${selected}`
  useEffect(() => { updateNodeInternals(id) }, [id, layoutKey, updateNodeInternals])

  const isEditing = (field: Field): boolean => field.uid === editingUid

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault()
      stopEditing()
    }
  }

  const addField = (event: MouseEvent): void => {
    event.stopPropagation()
    actions.addField(entity.uid)
  }

  return (
    <div className={`entity-node${selected ? ' is-selected' : ''}`}>
      {/* Borda da caixa: os quatro lados, para ligar a tabela inteira. */}
      {SIDES.map((side) => (
        <Handle
          key={side}
          type="source"
          id={handleId.box(side)}
          position={FLOW_POSITION[side]}
          className="handle-box"
        />
      ))}

      <header className="entity-node__head">
        <span className="entity-node__name">{entity.name}</span>
        {entity.label && <span className="entity-node__label">{entity.label}</span>}
      </header>

      <ul className="entity-node__fields nodrag nopan">
        {entity.fields.map((field) => {
          if (isEditing(field)) {
            return (
              <li key={field.uid} className="node-edit" onKeyDown={onKeyDown}>
                <div className="node-edit__line">
                  <input
                    className="node-edit__name"
                    value={field.name}
                    placeholder="nome_do_campo"
                    autoFocus
                    onChange={(e) => actions.updateField(entity.uid, field.uid, { name: e.target.value })}
                  />
                  <input
                    className="node-edit__type"
                    value={field.type}
                    placeholder="tipo"
                    list="common-types"
                    onChange={(e) => actions.updateField(entity.uid, field.uid, { type: e.target.value })}
                  />
                  <button
                    className="node-edit__remove"
                    title="remover campo"
                    onClick={() => actions.deleteField(entity.uid, field.uid)}
                  >
                    ✕
                  </button>
                </div>

                <div className="node-edit__flags">
                  {FIELD_FLAGS.map(({ key, label, title }) => (
                    <button
                      key={key}
                      className={`chip${field[key] ? ' is-on' : ''}`}
                      title={title}
                      onClick={() => actions.updateField(entity.uid, field.uid, { [key]: !field[key] })}
                    >
                      {label}
                    </button>
                  ))}
                  <button className="node-edit__done" onClick={stopEditing}>pronto</button>
                </div>

                <input
                  className="node-edit__note"
                  value={field.note ?? ''}
                  placeholder="observação"
                  onChange={(e) => actions.updateField(entity.uid, field.uid, { note: e.target.value })}
                />
              </li>
            )
          }

          return (
            <li
              key={field.uid}
              className="entity-node__field"
              title={field.note || undefined}
              onClick={() => editField(entity.uid, field.uid)}
            >
              {/* Ponto de conexão da própria linha: some até passar o mouse. */}
              <Handle
                type="source"
                id={handleId.field(field.uid, 'left')}
                position={FLOW_POSITION.left}
                className="handle-field"
              />
              <Handle
                type="source"
                id={handleId.field(field.uid, 'right')}
                position={FLOW_POSITION.right}
                className="handle-field"
              />

              <span className="entity-node__badge">
                {field.pk
                  ? <span className="badge badge--pk" title="chave primária">PK</span>
                  : field.fk
                    ? <span className="badge badge--fk" title="chave estrangeira">FK</span>
                    : null}
              </span>

              <span className="entity-node__field-name">
                {field.name || <em>sem nome</em>}
                {field.required && <span className="entity-node__required" title="obrigatório">*</span>}
              </span>

              <span className="entity-node__field-meta">
                {field.unique && <span className="badge badge--unique" title="valor único">U</span>}
                <span className="entity-node__field-type">{field.type}</span>
              </span>
            </li>
          )
        })}

        {entity.fields.length === 0 && <li className="entity-node__empty">sem campos</li>}
      </ul>

      {selected && (
        <button className="entity-node__add nodrag nopan" onClick={addField}>
          + campo
        </button>
      )}
    </div>
  )
}

export default memo(EntityNode)
