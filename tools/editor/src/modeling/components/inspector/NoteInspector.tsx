import { confirmDelete } from '../../../shared/Confirm'
import Icon from '../../../shared/Icon'
import type { ModelActions } from '../../hooks/useModelActions'
import type { Entity, Note } from '../../types'
import EndpointPicker from './EndpointPicker'

type NoteInspectorProps = {
  note: Note
  entities: Entity[]
  actions: ModelActions
}

/**
 * O editor da nota no painel: o texto num campo que cresce com ele (nada cortado),
 * sobre o que ela fala, e, recolhido, o que so muda o desenho. Apagar fica no fim.
 */
export default function NoteInspector({ note, entities, actions }: NoteInspectorProps) {
  return (
    <div className="editor">
      <section className="editor__section">
        <h3 className="editor__title">Texto</h3>
        <textarea
          className="autogrow note-editor"
          rows={6}
          value={note.text}
          placeholder="a explicação que não cabe numa tabela (a primeira linha vira o título)"
          aria-label="texto da nota"
          autoFocus={!note.text}
          onChange={(event) => actions.updateNote(note.uid, { text: event.target.value })}
        />
        <p className="editor__hint">A primeira linha aparece como título na nota resumida.</p>
      </section>

      <section className="editor__section">
        <h3 className="editor__title">Sobre</h3>
        <EndpointPicker
          label=""
          entities={entities}
          entityName={note.anchor ?? ''}
          fieldName={note.anchorField ?? ''}
          allowNone
          onChange={(anchor, anchorField) => actions.updateNote(note.uid, { anchor, anchorField })}
        />
        <p className="editor__hint">Sem tabela, a nota fica solta no desenho.</p>
      </section>

      <details className="disclosure">
        <summary><Icon name="chevronDown" size={14} />Mais opções</summary>
        <label className="field-group">
          <span>Largura da caixa no desenho <small>{note.width}px</small></span>
          <input
            type="range"
            min={180}
            max={560}
            step={20}
            value={note.width}
            onChange={(event) => actions.updateNote(note.uid, { width: Number(event.target.value) })}
          />
        </label>
        <label className="switch">
          <input
            type="checkbox"
            checked={note.inherited}
            onChange={(event) => actions.updateNote(note.uid, { inherited: event.target.checked })}
          />
          <span className="switch__track" aria-hidden="true" />
          <span className="switch__text">
            Veio da modelagem anterior
            <small>marca escrita no arquivo, para quem lê o YAML; a comparação do editor não depende dela</small>
          </span>
        </label>
      </details>

      <div className="danger-zone">
        <button
          className="btn btn--danger"
          onClick={() => void confirmDelete({ title: 'Apagar esta nota?', confirmLabel: 'Apagar nota' }).then((ok) => ok && actions.deleteNote(note.uid))}
        >
          <Icon name="trash" size={14} />
          <span>Apagar nota</span>
        </button>
      </div>
    </div>
  )
}
