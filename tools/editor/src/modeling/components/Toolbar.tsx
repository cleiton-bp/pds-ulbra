import Icon from '../../shared/Icon'
import {
  DropMenu, EditToggle, IconButton, MenuChoice, HomeButton, SaveBadge, Segmented,
} from '../../shared/ToolbarParts'
import { tourTarget } from '../../tour/targets'
import type { SaveStatus } from '../../shared/useWorkspace'
import type { ModelView, NotesMode } from './canvas/Board'

type ToolbarProps = {
  title: string
  /** A linha de baixo do titulo: com quem o arquivo esta sendo comparado. */
  subtitle: string
  status: SaveStatus
  canEdit: boolean
  view: ModelView
  /** Sem arquivo-base nao ha o que recolher: "Mudanças" fica desligado. */
  canCompare: boolean
  notesMode: NotesMode
  noteCount: number
  editing: boolean
  onView: (view: ModelView) => void
  onNotesMode: (mode: NotesMode) => void
  onToggleEditing: () => void
  onSearch: () => void
  onAddEntity: () => void
  onAddNote: () => void
  /** Abre o tour do editor (ver `tour/`). */
  onTour: () => void
}

const NOTES_TITLE: Record<NotesMode, string> = {
  markers: 'notas resumidas',
  boxes: 'notas inteiras',
  hidden: 'notas ocultas',
}

export default function Toolbar({
  title, subtitle, status, canEdit, view, canCompare, notesMode, noteCount,
  editing, onView, onNotesMode, onToggleEditing, onSearch,
  onAddEntity, onAddNote, onTour,
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
            <Segmented<ModelView>
              label="o que o desenho mostra"
              tour="view"
              value={canCompare ? view : 'all'}
              onChange={onView}
              options={[
                {
                  value: 'changes',
                  label: 'Mudanças',
                  title: canCompare
                    ? 'recolhe as tabelas que não mudaram e mostra só as notas novas'
                    : 'sem arquivo anterior para comparar, escolha um no painel',
                  disabled: !canCompare,
                },
                { value: 'all', label: 'Tudo', title: 'todas as tabelas inteiras e todas as notas' },
              ]}
            />

            <DropMenu
              label={<><Icon name="note" /><span className="menu__label">Notas</span></>}
              ariaLabel="Notas"
              title={`como as notas aparecem no desenho (agora, ${NOTES_TITLE[notesMode]})`}
              active={notesMode !== 'markers'}
            >
              <header className="menu__head">
                <span>notas no desenho</span>
                <em>{noteCount} no arquivo</em>
              </header>
              <MenuChoice
                name="notas"
                checked={notesMode === 'markers'}
                label="Resumidas"
                hint="a nota de uma tabela vira o marcador no cabeçalho dela, e o texto inteiro abre no painel, sem nada por cima das tabelas"
                onChange={() => onNotesMode('markers')}
              />
              <MenuChoice
                name="notas"
                checked={notesMode === 'boxes'}
                label="Inteiras"
                hint="cada nota em caixa, do tamanho e no lugar gravados no arquivo"
                onChange={() => onNotesMode('boxes')}
              />
              <MenuChoice
                name="notas"
                checked={notesMode === 'hidden'}
                label="Ocultas"
                hint="só as tabelas e as ligações (Alt+3)"
                onChange={() => onNotesMode('hidden')}
              />
            </DropMenu>

            <button {...tourTarget('search')} className="btn" aria-label="Buscar" title="buscar uma tabela pelo nome (Ctrl+K)" onClick={onSearch}>
              <Icon name="search" />
              <span className="btn__label">Buscar</span>
              <kbd>⌘K</kbd>
            </button>

            <span className="toolbar__sep" aria-hidden="true" />

            {editing && (
              <>
                <button className="btn" aria-label="Nova tabela" title="nova tabela, no meio da tela" onClick={onAddEntity}><Icon name="plus" /><span className="btn__label">Tabela</span></button>
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
