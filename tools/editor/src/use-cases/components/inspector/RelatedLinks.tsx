import { linkSentence, linksOf } from '../../model/analysis'
import type { Selection, UseCaseDoc } from '../../types'

type RelatedLinksProps = {
  doc: UseCaseDoc
  uid: string
  onSelect: (selection: Selection) => void
}

/**
 * As ligacoes que tocam o elemento, lidas como frase. Clicar abre a ligacao no
 * painel — e o caminho para mexer numa linha curta demais para acertar no canvas.
 */
export default function RelatedLinks({ doc, uid, onSelect }: RelatedLinksProps) {
  const links = linksOf(doc, uid)

  return (
    <>
      <div className="panel__section">
        <h3>Ligações</h3>
        <span className="panel__count">{links.length}</span>
      </div>

      {links.length === 0 ? (
        <p className="panel__hint">Nenhuma ainda. Puxe da borda deste elemento até outro para ligar os dois.</p>
      ) : (
        <ul className="related">
          {links.map((link) => (
            <li key={link.uid}>
              <button onClick={() => onSelect({ type: 'link', uid: link.uid })}>
                <span className="related__text">{linkSentence(doc, link)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
