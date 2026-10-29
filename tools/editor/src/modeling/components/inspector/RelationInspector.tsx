import { confirmDelete } from '../../../shared/Confirm'
import Icon from '../../../shared/Icon'
import type { ModelActions } from '../../hooks/useModelActions'
import { RELATION_KINDS } from '../../model/constants'
import type { Entity, Relation, RelationKind } from '../../types'
import EndpointPicker from './EndpointPicker'

type RelationInspectorProps = {
  relation: Relation
  entities: Entity[]
  actions: ModelActions
}

/**
 * O editor da ligacao no painel, no mesmo desenho do da tabela e do da nota: as
 * pontas, a cardinalidade e a observacao em secoes, e apagar no fim.
 */
export default function RelationInspector({ relation, entities, actions }: RelationInspectorProps) {
  const set = (patch: Partial<Relation>): void => actions.updateRelation(relation.uid, patch)

  return (
    <div className="editor">
      <header className="panel__head">
        <span className="panel__kind">Ligação</span>
      </header>

      <section className="editor__section">
        <h3 className="editor__title">De</h3>
        <EndpointPicker
          label=""
          entities={entities}
          entityName={relation.from}
          fieldName={relation.fromField}
          onChange={(from, fromField) => set({ from, fromField })}
        />
      </section>

      <section className="editor__section">
        <h3 className="editor__title">Para</h3>
        <EndpointPicker
          label=""
          entities={entities}
          entityName={relation.to}
          fieldName={relation.toField}
          onChange={(to, toField) => set({ to, toField })}
        />
        <p className="editor__hint">
          Escolher a coluna faz a linha grudar na altura dela, e o lado em que ela encosta
          sai da posição das tabelas.
        </p>
      </section>

      <section className="editor__section">
        <label className="field-group">
          <span>Cardinalidade</span>
          <select
            value={relation.kind}
            onChange={(event) => set({ kind: event.target.value as RelationKind })}
          >
            {RELATION_KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>{kind.label}</option>
            ))}
          </select>
        </label>

        <label className="field-group">
          <span>Observação</span>
          <textarea
            className="autogrow"
            rows={3}
            value={relation.note}
            placeholder="por que esta ligação existe"
            onChange={(event) => set({ note: event.target.value })}
          />
        </label>
      </section>

      <div className="danger-zone">
        <button
          className="btn btn--danger"
          onClick={() => void confirmDelete({ title: `Apagar a ligação ${relation.from} → ${relation.to}?`, confirmLabel: 'Apagar ligação' }).then((ok) => ok && actions.deleteRelation(relation.uid))}
        >
          <Icon name="trash" size={14} />
          <span>Apagar ligação</span>
        </button>
      </div>
    </div>
  )
}
