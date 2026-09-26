import { bound } from '../../model/refs'
import type { DiagramActions } from '../../hooks/useDiagramActions'
import type { Note, UseCaseDoc } from '../../types'
import ElementPicker from './ElementPicker'

type NoteInspectorProps = {
  doc: UseCaseDoc
  note: Note
  actions: DiagramActions
}

export default function NoteInspector({ doc, note, actions }: NoteInspectorProps) {
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
          placeholder="a explicação que não cabe no desenho"
          onChange={(event) => actions.updateNote(note.uid, { text: event.target.value })}
        />
      </label>

      <ElementPicker
        label="Aponta para"
        doc={doc}
        value={note.anchor}
        allowNone
        onChange={(uid) => actions.updateNote(note.uid, { anchor: uid ? bound(uid) : null })}
      />

      <p className="panel__hint">
        Também dá para puxar a ligação no canvas: da borda da nota até o ator ou o caso de uso.
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
