import { linkSentence } from '../../model/analysis'
import { LINK_KINDS, linkKind } from '../../model/constants'
import { kindFits } from '../../model/operations'
import { bound, elementType, targetOf } from '../../model/refs'
import type { DiagramActions } from '../../hooks/useDiagramActions'
import type { Link, LinkKind, UseCaseDoc } from '../../types'
import ElementPicker from './ElementPicker'

/** Valor da opcao que representa o tipo desconhecido no `select` — nao e um tipo de verdade. */
const UNKNOWN = '__unknown__'

type LinkInspectorProps = {
  doc: UseCaseDoc
  link: Link
  actions: DiagramActions
}

export default function LinkInspector({ doc, link, actions }: LinkInspectorProps) {
  const fromType = elementType(doc, targetOf(doc, link.from))
  const toType = elementType(doc, targetOf(doc, link.to))
  const kind = linkKind(link.kind)

  return (
    <>
      <header className="panel__head">
        <span className="panel__kind">ligação</span>
        <button className="panel__delete" onClick={() => actions.deleteLink(link.uid)}>
          apagar
        </button>
      </header>

      {/* A frase vem primeiro: e o que a linha diz, antes de como ela e feita. */}
      <p className="panel__sentence">{linkSentence(doc, link)}</p>

      <ElementPicker
        label="De"
        doc={doc}
        value={link.from}
        onChange={(uid) => actions.updateLink(link.uid, { from: bound(uid) })}
      />

      <label className="field-group">
        <span>Tipo</span>
        <select
          value={link.unknownKind ? UNKNOWN : link.kind}
          onChange={(event) => {
            if (event.target.value !== UNKNOWN) actions.updateLink(link.uid, { kind: event.target.value as LinkKind })
          }}
        >
          {/* O tipo escrito no arquivo que o editor nao conhece aparece como esta, e
              escolher qualquer outro — inclusive o que as pontas sugerem — o troca. */}
          {link.unknownKind && <option value={UNKNOWN}>"{link.unknownKind}" (desconhecido)</option>}
          {LINK_KINDS.map((option) => (
            // O tipo que nao combina com as pontas fica visivel, mas nao escolhivel:
            // assim da para ver por que a opcao nao esta disponivel.
            <option
              key={option.value}
              value={option.value}
              disabled={!kindFits(option.value, fromType, toType) && option.value !== link.kind}
            >
              {option.label}{option.keyword ? ` ${option.keyword}` : ''}
            </option>
          ))}
        </select>
      </label>

      <ElementPicker
        label="Para"
        doc={doc}
        value={link.to}
        onChange={(uid) => actions.updateLink(link.uid, { to: bound(uid) })}
      />

      {link.kind !== 'association' && (
        <button className="btn btn--ghost btn--block" onClick={() => actions.reverseLink(link.uid)}>
          ⇄ inverter o sentido
        </button>
      )}

      <p className="panel__hint">{kind.hint}</p>

      <label className="field-group">
        <span>{link.kind === 'extend' ? 'Condição' : 'Observação'}</span>
        <textarea
          rows={3}
          value={link.note}
          placeholder={link.kind === 'extend' ? 'quando a extensão acontece' : 'por que esta ligação existe'}
          onChange={(event) => actions.updateLink(link.uid, { note: event.target.value })}
        />
      </label>
    </>
  )
}
