import { capabilitiesOf, viaLabel } from '../../model/analysis'
import type { DiagramActions } from '../../hooks/useDiagramActions'
import type { Selection, UseCaseDoc } from '../../types'

type DocInspectorProps = {
  doc: UseCaseDoc
  actions: DiagramActions
  onSelect: (selection: Selection) => void
}

/**
 * O que aparece quando nada esta selecionado: dados do arquivo, o resumo de quem
 * faz o que, e os avisos.
 *
 * O resumo e a leitura do diagrama em texto — a mesma resposta que o desenho da,
 * sem precisar seguir linha por linha.
 */
export default function DocInspector({ doc, actions, onSelect }: DocInspectorProps) {
  return (
    <>
      <header className="panel__head">
        <span className="panel__kind">arquivo</span>
      </header>

      <label className="field-group">
        <span>Título</span>
        <input
          value={doc.meta.title}
          placeholder="Relato — do envio ao acompanhamento"
          onChange={(event) => actions.setMeta({ title: event.target.value })}
        />
      </label>

      <label className="field-group">
        <span>Sistema</span>
        <input
          value={doc.meta.system}
          placeholder="o nome que vai no topo da fronteira"
          onChange={(event) => actions.setMeta({ system: event.target.value })}
        />
      </label>

      <label className="field-group">
        <span>Descrição</span>
        <textarea
          rows={3}
          value={doc.meta.description}
          placeholder="o que este diagrama cobre"
          onChange={(event) => actions.setMeta({ description: event.target.value })}
        />
      </label>

      <p className="panel__counts">
        {doc.actors.length} ator(es) · {doc.useCases.length} caso(s) de uso · {doc.links.length} ligação(ões) · {doc.notes.length} nota(s)
      </p>

      {doc.warnings.length > 0 && (
        <div className="panel__warnings">
          <h3>Avisos</h3>
          <ul>
            {doc.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}

      {doc.actors.length > 0 && (
        <>
          <div className="panel__section">
            <h3>Quem faz o quê</h3>
          </div>

          {doc.actors.map((actor) => {
            const capabilities = capabilitiesOf(doc, actor.uid)
            return (
              <div key={actor.uid} className="who">
                <button className="who__actor" onClick={() => onSelect({ type: 'actor', uid: actor.uid })}>
                  {actor.name || <em>sem nome</em>}
                </button>
                {capabilities.length === 0 ? (
                  <p className="who__none">nenhum caso de uso ainda</p>
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
              </div>
            )
          })}
        </>
      )}

      <div className="panel__tip">
        <p>Clique num elemento para editar; clique duplo edita o nome ali mesmo.</p>
        <p>Puxe da borda de um elemento até outro para ligar os dois.</p>
        <p>O arquivo grava sozinho — <kbd>⌘S</kbd> força na hora.</p>
      </div>
    </>
  )
}
