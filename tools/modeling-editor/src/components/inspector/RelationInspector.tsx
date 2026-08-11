import type { ModelActions } from '../../hooks/useModelActions'
import { RELATION_KINDS } from '../../model/constants'
import type { Entity, Relation, RelationKind } from '../../types'
import EndpointPicker from './EndpointPicker'

type RelationInspectorProps = {
  relation: Relation
  entities: Entity[]
  actions: ModelActions
}

export default function RelationInspector({ relation, entities, actions }: RelationInspectorProps) {
  const set = (patch: Partial<Relation>): void => actions.updateRelation(relation.uid, patch)

  return (
    <>
      <header className="panel__head">
        <span className="panel__kind">relação</span>
        <button className="panel__delete" onClick={() => actions.deleteRelation(relation.uid)}>
          apagar
        </button>
      </header>

      <EndpointPicker
        label="De"
        entities={entities}
        entityName={relation.from}
        fieldName={relation.fromField}
        onChange={(from, fromField) => set({ from, fromField })}
      />

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

      <EndpointPicker
        label="Para"
        entities={entities}
        entityName={relation.to}
        fieldName={relation.toField}
        onChange={(to, toField) => set({ to, toField })}
      />

      <p className="panel__hint">
        Escolher o campo faz a linha grudar na altura dele. O lado em que ela encosta é
        decidido pela posição das caixas — arraste uma tabela e a linha se reajusta.
      </p>

      <label className="field-group">
        <span>Observação</span>
        <textarea
          rows={4}
          value={relation.note}
          placeholder="por que esta relação existe"
          onChange={(event) => set({ note: event.target.value })}
        />
      </label>
    </>
  )
}
