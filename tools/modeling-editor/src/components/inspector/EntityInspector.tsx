import { useRef } from 'react'
import type { DragEvent } from 'react'
import type { ModelActions } from '../../hooks/useModelActions'
import type { Entity } from '../../types'
import FieldRow from './FieldRow'

type EntityInspectorProps = {
  entity: Entity
  actions: ModelActions
}

export default function EntityInspector({ entity, actions }: EntityInspectorProps) {
  // Reordenacao de campo por arrasto nativo — guarda de onde saiu ate o solta.
  const dragFrom = useRef<number | null>(null)

  const onDragStart = (event: DragEvent<HTMLLIElement>, index: number): void => {
    dragFrom.current = index
    event.dataTransfer.effectAllowed = 'move'
  }

  const onDragOver = (event: DragEvent<HTMLLIElement>): void => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const onDrop = (event: DragEvent<HTMLLIElement>, index: number): void => {
    event.preventDefault()
    const from = dragFrom.current
    if (from !== null && from !== index) actions.moveField(entity.uid, from, index)
    dragFrom.current = null
  }

  return (
    <>
      <header className="panel__head">
        <span className="panel__kind">entidade</span>
        <button className="panel__delete" onClick={() => actions.deleteEntity(entity.uid)}>
          apagar
        </button>
      </header>

      <label className="field-group">
        <span>Nome no código</span>
        <input
          value={entity.name}
          placeholder="Account"
          onChange={(event) => actions.renameEntity(entity.uid, event.target.value)}
        />
      </label>

      <label className="field-group">
        <span>Nome no domínio</span>
        <input
          value={entity.label}
          placeholder="Conta"
          onChange={(event) => actions.updateEntity(entity.uid, { label: event.target.value })}
        />
      </label>

      <label className="field-group">
        <span>Descrição</span>
        <textarea
          rows={3}
          value={entity.description}
          placeholder="para que serve esta entidade"
          onChange={(event) => actions.updateEntity(entity.uid, { description: event.target.value })}
        />
      </label>

      <div className="panel__section">
        <h3>Campos</h3>
        <button className="btn btn--ghost" onClick={() => actions.addField(entity.uid)}>
          + campo
        </button>
      </div>

      <ul className="fields">
        {entity.fields.map((field, index) => (
          <FieldRow
            key={field.uid}
            field={field}
            index={index}
            entityUid={entity.uid}
            actions={actions}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
          />
        ))}
      </ul>

      {entity.fields.length === 0 && (
        <p className="panel__tip">Nenhum campo ainda. Comece pela chave primária.</p>
      )}
    </>
  )
}
