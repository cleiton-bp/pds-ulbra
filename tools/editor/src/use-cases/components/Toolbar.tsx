import Icon from '../../shared/Icon'
import { DropMenu, EditToggle, HomeButton, IconButton, SaveBadge } from '../../shared/ToolbarParts'
import { tourTarget } from '../../tour/targets'
import type { SaveStatus } from '../../shared/useWorkspace'

type ToolbarProps = {
  title: string
  /** A linha de baixo do titulo: o nome do arquivo. */
  subtitle: string
  status: SaveStatus
  canEdit: boolean
  showNotes: boolean
  showBoundary: boolean
  focus: boolean
  /** Quantas notas o arquivo tem, para o menu dizer o tamanho do que mexe. */
  noteCount: number
  editing: boolean
  onToggleNotes: () => void
  onToggleBoundary: () => void
  onToggleFocus: () => void
  onToggleEditing: () => void
  onSearch: () => void
  onAddActor: () => void
  onAddUseCase: () => void
  onAddNote: () => void
  /** Abre o tour do editor (ver `tour/`). */
  onTour: () => void
}

export default function Toolbar({
  title, subtitle, status, canEdit, showNotes, showBoundary, focus, noteCount,
  editing, onToggleNotes, onToggleBoundary, onToggleFocus,
  onToggleEditing, onSearch, onAddActor, onAddUseCase, onAddNote, onTour,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <HomeButton />

      <div className="toolbar__heading">
        <h2 className="toolbar__title" title={title}>{title}</h2>
        {subtitle && <span className="toolbar__sub">{subtitle}</span>}
      </div>

      <div className="toolbar__actions">
        {canEdit && (
          <>
            <DropMenu
              label={<><Icon name="eye" /><span className="btn__label">Ver</span></>}
              ariaLabel="Ver"
              tour="see"
              title="o que aparece no desenho: notas, fronteira e realce"
              active={focus || !showNotes || !showBoundary}
            >
              <header className="menu__head">
                <span>notas</span>
                <em>{showNotes ? noteCount : 0} de {noteCount} na tela</em>
              </header>

              <label className="menu__item">
                <input type="checkbox" checked={showNotes} onChange={onToggleNotes} />
                <span>
                  Mostrar as notas
                  <small>desmarcado, fica só o diagrama (Alt+3)</small>
                </span>
              </label>

              <header className="menu__head menu__head--sec">
                <span>diagrama</span>
              </header>

              <label className="menu__item">
                <input type="checkbox" checked={showBoundary} onChange={onToggleBoundary} />
                <span>
                  Mostrar a fronteira do sistema
                  <small>o retângulo em volta dos casos de uso, com o nome do sistema</small>
                </span>
              </label>

              <label className="menu__item">
                <input type="checkbox" checked={focus} onChange={onToggleFocus} />
                <span>
                  Realçar quem faz o quê
                  <small>
                    escolha um ator e acende o que ele realiza; escolha um caso de uso e acende quem
                    o realiza (Alt+4)
                  </small>
                </span>
              </label>
            </DropMenu>

            <button {...tourTarget('search')} className="btn" aria-label="Buscar" title="buscar ator ou caso de uso (Ctrl+K)" onClick={onSearch}>
              <Icon name="search" />
              <span className="btn__label">Buscar</span>
              <kbd>⌘K</kbd>
            </button>

            <span className="toolbar__sep" aria-hidden="true" />

            {editing && (
              <>
                <button className="btn" aria-label="Novo ator" title="novo ator, no meio da tela" onClick={onAddActor}><Icon name="plus" /><span className="btn__label">Ator</span></button>
                <button className="btn" aria-label="Novo caso de uso" title="novo caso de uso, no meio da tela" onClick={onAddUseCase}><Icon name="plus" /><span className="btn__label">Caso de uso</span></button>
                <button className="btn" aria-label="Nova nota" title="nova nota, no meio da tela" onClick={onAddNote}><Icon name="plus" /><span className="btn__label">Nota</span></button>
              </>
            )}
            <EditToggle editing={editing} onToggle={onToggleEditing} />
          </>
        )}
        <SaveBadge status={status} />
        {canEdit && <IconButton icon="help" label="tour: conheça o editor em um minuto" tour="help" onClick={onTour} />}
      </div>
    </header>
  )
}
