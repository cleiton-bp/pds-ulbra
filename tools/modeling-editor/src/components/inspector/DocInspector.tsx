import type { ModelActions } from '../../hooks/useModelActions'
import type { ModelDoc } from '../../types'

type DocInspectorProps = {
  doc: ModelDoc
  actions: ModelActions
}

/** O que aparece quando nada esta selecionado: dados do arquivo e avisos. */
export default function DocInspector({ doc, actions }: DocInspectorProps) {
  return (
    <>
      <header className="panel__head">
        <span className="panel__kind">arquivo</span>
      </header>

      <label className="field-group">
        <span>Título</span>
        <input
          value={doc.meta.title}
          placeholder="Etapa 1 — Fundação"
          onChange={(event) => actions.setMeta({ title: event.target.value })}
        />
      </label>

      <label className="field-group">
        <span>Descrição</span>
        <textarea
          rows={4}
          value={doc.meta.description}
          placeholder="o que esta modelagem cobre"
          onChange={(event) => actions.setMeta({ description: event.target.value })}
        />
      </label>

      <p className="panel__counts">
        {doc.entities.length} entidade(s) · {doc.relations.length} relação(ões) · {doc.notes.length} nota(s)
      </p>

      {doc.warnings.length > 0 && (
        <div className="panel__warnings">
          <h3>Avisos</h3>
          <ul>
            {doc.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}

      <div className="panel__tip">
        <p>Clique numa caixa para editar.</p>
        <p>Puxe da lateral de uma entidade até outra para criar uma relação.</p>
        <p>O arquivo grava sozinho — <kbd>⌘S</kbd> força na hora.</p>
      </div>
    </>
  )
}
