import { performerViaLabel, performersOf } from '../../model/analysis'
import { USE_CASE_MAX_WIDTH, USE_CASE_MIN_WIDTH } from '../../model/constants'
import type { DiagramActions } from '../../hooks/useDiagramActions'
import type { Selection, UseCase, UseCaseDoc } from '../../types'
import RelatedLinks from './RelatedLinks'

type UseCaseInspectorProps = {
  doc: UseCaseDoc
  useCase: UseCase
  actions: DiagramActions
  onSelect: (selection: Selection) => void
}

/**
 * Passos em textarea, um por linha. O estado guarda a lista como foi digitada —
 * inclusive a linha vazia do Enter que acabou de ser apertado —, e so a gravacao
 * descarta passo em branco. Filtrar aqui engoliria o Enter antes da proxima letra.
 */
const toLines = (steps: string[]): string => steps.join('\n')
const fromLines = (text: string): string[] => text.split('\n')

export default function UseCaseInspector({ doc, useCase, actions, onSelect }: UseCaseInspectorProps) {
  const set = (patch: Partial<UseCase>): void => actions.updateUseCase(useCase.uid, patch)
  const performers = performersOf(doc, useCase.uid)

  return (
    <>
      <header className="panel__head">
        <span className="panel__kind">caso de uso</span>
        <button className="panel__delete" onClick={() => actions.deleteUseCase(useCase.uid)}>
          apagar
        </button>
      </header>

      <div className="field-row">
        <label className="field-group field-group--code">
          <span>Código</span>
          <input
            value={useCase.id}
            placeholder="UC01"
            onChange={(event) => set({ id: event.target.value })}
          />
        </label>

        <label className="field-group">
          <span>Nome</span>
          <input
            value={useCase.name}
            placeholder="Abrir relato"
            onChange={(event) => set({ name: event.target.value })}
          />
        </label>
      </div>

      <label className="field-group">
        <span>Descrição</span>
        <textarea
          rows={3}
          value={useCase.description}
          placeholder="o objetivo, numa frase: o que o ator consegue ao final"
          onChange={(event) => set({ description: event.target.value })}
        />
      </label>

      <div className="panel__section">
        <h3>Quem realiza</h3>
        <span className="panel__count">{performers.length}</span>
      </div>

      {performers.length === 0 ? (
        <p className="panel__hint">
          Nenhum ator chega aqui. Puxe da borda de um boneco até esta elipse, ou inclua este
          caso de uso num que algum ator já realiza.
        </p>
      ) : (
        <ul className="related">
          {performers.map(({ actor, via, from }) => (
            <li key={actor.uid}>
              <button onClick={() => onSelect({ type: 'actor', uid: actor.uid })}>
                <span className="related__text">{actor.name || 'sem nome'}</span>
                {via !== 'direct' && <small>{performerViaLabel(doc, via, from)}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <RelatedLinks doc={doc} uid={useCase.uid} onSelect={onSelect} />

      <div className="panel__section">
        <h3>Especificação</h3>
      </div>

      <label className="field-group">
        <span>Pré-condições</span>
        <textarea
          rows={2}
          value={useCase.preconditions}
          placeholder="o que precisa ser verdade antes de começar"
          onChange={(event) => set({ preconditions: event.target.value })}
        />
      </label>

      <label className="field-group">
        <span>Fluxo principal <small>um passo por linha</small></span>
        <textarea
          rows={6}
          className="steps"
          value={toLines(useCase.mainFlow)}
          placeholder={'O relator abre o widget\nDescreve o problema\nEnvia o relato'}
          onChange={(event) => set({ mainFlow: fromLines(event.target.value) })}
        />
      </label>

      <div className="field-group">
        <div className="field-group__head">
          <span>Fluxos alternativos</span>
          <button className="btn btn--ghost btn--small" onClick={() => actions.addAlternativeFlow(useCase.uid)}>
            + fluxo
          </button>
        </div>

        {useCase.alternativeFlows.length === 0 && (
          <p className="panel__hint">O que muda quando algo sai do caminho principal.</p>
        )}

        <ul className="flows">
          {useCase.alternativeFlows.map((flow) => (
            <li key={flow.uid} className="flow">
              <div className="flow__line">
                <input
                  value={flow.title}
                  placeholder="quando — ex.: 2a. a descrição fica em branco"
                  onChange={(event) =>
                    actions.updateAlternativeFlow(useCase.uid, flow.uid, { title: event.target.value })}
                />
                <button
                  className="flow__remove"
                  title="remover fluxo"
                  onClick={() => actions.deleteAlternativeFlow(useCase.uid, flow.uid)}
                >
                  ✕
                </button>
              </div>
              <textarea
                rows={3}
                className="steps"
                value={toLines(flow.steps)}
                placeholder="um passo por linha"
                onChange={(event) =>
                  actions.updateAlternativeFlow(useCase.uid, flow.uid, { steps: fromLines(event.target.value) })}
              />
            </li>
          ))}
        </ul>
      </div>

      <label className="field-group">
        <span>Pós-condições</span>
        <textarea
          rows={2}
          value={useCase.postconditions}
          placeholder="o que passa a ser verdade quando termina bem"
          onChange={(event) => set({ postconditions: event.target.value })}
        />
      </label>

      <label className="field-group">
        <span>Largura da elipse ({useCase.width}px)</span>
        <input
          type="range"
          min={USE_CASE_MIN_WIDTH}
          max={USE_CASE_MAX_WIDTH}
          step={10}
          value={useCase.width}
          onChange={(event) => set({ width: Number(event.target.value) })}
        />
      </label>
    </>
  )
}
