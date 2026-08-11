import type { DragEvent } from 'react'
import type { ModelActions } from '../../hooks/useModelActions'
import { FIELD_FLAGS } from '../../model/constants'
import type { Field } from '../../types'

type FieldRowProps = {
  field: Field
  index: number
  entityUid: string
  actions: ModelActions
  onDragStart: (event: DragEvent<HTMLLIElement>, index: number) => void
  onDragOver: (event: DragEvent<HTMLLIElement>) => void
  onDrop: (event: DragEvent<HTMLLIElement>, index: number) => void
}

export default function FieldRow({
  field, index, entityUid, actions, onDragStart, onDragOver, onDrop,
}: FieldRowProps) {
  const set = (patch: Partial<Field>): void => actions.updateField(entityUid, field.uid, patch)

  return (
    <li
      className="field"
      draggable
      onDragStart={(event) => onDragStart(event, index)}
      onDragOver={onDragOver}
      onDrop={(event) => onDrop(event, index)}
    >
      <div className="field__line">
        <span className="field__grip" title="arraste para reordenar">⠿</span>
        <input
          className="field__name"
          value={field.name}
          placeholder="nome_do_campo"
          onChange={(event) => set({ name: event.target.value })}
        />
        <input
          className="field__type"
          value={field.type}
          placeholder="tipo"
          list="common-types"
          onChange={(event) => set({ type: event.target.value })}
        />
        <button
          className="field__remove"
          title="remover campo"
          onClick={() => actions.deleteField(entityUid, field.uid)}
        >
          ✕
        </button>
      </div>

      <div className="field__flags">
        {FIELD_FLAGS.map(({ key, label, title }) => (
          <button
            key={key}
            className={`chip${field[key] ? ' is-on' : ''}`}
            title={title}
            onClick={() => set({ [key]: !field[key] } as Partial<Field>)}
          >
            {label}
          </button>
        ))}
      </div>

      <input
        className="field__note"
        value={field.note ?? ''}
        placeholder="observação"
        onChange={(event) => set({ note: event.target.value })}
      />
    </li>
  )
}
