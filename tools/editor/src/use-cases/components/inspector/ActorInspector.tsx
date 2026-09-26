import { capabilitiesOf, viaLabel } from '../../model/analysis'
import { ACTOR_KINDS } from '../../model/constants'
import type { DiagramActions } from '../../hooks/useDiagramActions'
import type { Actor, Selection, UseCaseDoc } from '../../types'
import RelatedLinks from './RelatedLinks'

type ActorInspectorProps = {
  doc: UseCaseDoc
  actor: Actor
  actions: DiagramActions
  onSelect: (selection: Selection) => void
}

export default function ActorInspector({ doc, actor, actions, onSelect }: ActorInspectorProps) {
  const capabilities = capabilitiesOf(doc, actor.uid)
  // Sistema externo participa do caso de uso, nao o realiza — ver `performVerb`.
  const isSystem = actor.kind === 'system'

  return (
    <>
      <header className="panel__head">
        <span className="panel__kind">ator</span>
        <button className="panel__delete" onClick={() => actions.deleteActor(actor.uid)}>
          apagar
        </button>
      </header>

      <label className="field-group">
        <span>Nome</span>
        <input
          value={actor.name}
          placeholder="Relator"
          onChange={(event) => actions.updateActor(actor.uid, { name: event.target.value })}
        />
      </label>

      <div className="field-group">
        <span>É</span>
        <div className="chips">
          {ACTOR_KINDS.map((kind) => (
            <button
              key={kind.value}
              className={`chip${actor.kind === kind.value ? ' is-on' : ''}`}
              aria-pressed={actor.kind === kind.value}
              onClick={() => actions.updateActor(actor.uid, { kind: kind.value })}
            >
              {kind.label}
            </button>
          ))}
        </div>
      </div>

      <label className="field-group">
        <span>Descrição</span>
        <textarea
          rows={3}
          value={actor.description}
          placeholder="quem é, e de onde vem"
          onChange={(event) => actions.updateActor(actor.uid, { description: event.target.value })}
        />
      </label>

      <div className="panel__section">
        <h3>{isSystem ? 'De que participa' : 'O que pode fazer'}</h3>
        <span className="panel__count">{capabilities.length}</span>
      </div>

      {capabilities.length === 0 ? (
        <p className="panel__hint">
          Nada ainda. Puxe da borda do {isSystem ? 'sistema' : 'boneco'} até uma elipse para
          ligá-lo àquele caso de uso — ou até outro ator, para dizer que ele é um tipo daquele.
        </p>
      ) : (
        <ul className="related">
          {capabilities.map(({ useCase, via, from }) => (
            <li key={useCase.uid}>
              <button onClick={() => onSelect({ type: 'useCase', uid: useCase.uid })}>
                <span className="related__id">{useCase.id}</span>
                <span className="related__text">{useCase.name || 'sem nome'}</span>
                {via !== 'direct' && <small>{viaLabel(doc, via, from)}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <RelatedLinks doc={doc} uid={actor.uid} onSelect={onSelect} />
    </>
  )
}
