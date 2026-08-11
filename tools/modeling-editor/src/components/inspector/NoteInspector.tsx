import type { ModelActions } from '../../hooks/useModelActions'
import type { Entity, Note } from '../../types'
import EndpointPicker from './EndpointPicker'

type NoteInspectorProps = {
  note: Note
  entities: Entity[]
  actions: ModelActions
}

export default function NoteInspector({ note, entities, actions }: NoteInspectorProps) {
  return (
    <>
      <header className="panel__head">
        <span className="panel__kind">nota</span>
        <button className="panel__delete" onClick={() => actions.deleteNote(note.uid)}>
          apagar
        </button>
      </header>

      <label className="field-group">
        <span>Texto</span>
        <textarea
          rows={10}
          value={note.text}
          placeholder="a explicação que não cabe numa tabela"
          onChange={(event) => actions.updateNote(note.uid, { text: event.target.value })}
        />
      </label>

      <EndpointPicker
        label="Aponta para"
        entities={entities}
        entityName={note.anchor ?? ''}
        fieldName={note.anchorField ?? ''}
        allowNone
        onChange={(anchor, anchorField) => actions.updateNote(note.uid, { anchor, anchorField })}
      />

      <p className="panel__hint">
        Também dá para puxar a seta no canvas: da borda da nota até a caixa, ou até uma
        linha específica da tabela.
      </p>

      <label className="field-group">
        <span>Largura ({note.width}px)</span>
        <input
          type="range"
          min={180}
          max={560}
          step={20}
          value={note.width}
          onChange={(event) => actions.updateNote(note.uid, { width: Number(event.target.value) })}
        />
      </label>
    </>
  )
}
