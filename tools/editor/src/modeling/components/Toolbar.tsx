import Icon from '../../shared/Icon'
import {
  DropMenu, EditToggle, IconButton, MenuCheck, MenuChoice, HomeButton, SaveBadge, Segmented,
} from '../../shared/ToolbarParts'
import { tourTarget } from '../../tour/targets'
import type { SaveStatus } from '../../shared/useWorkspace'
import type { ClickFocus, ModelView, NotesMode } from './canvas/Board'

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
  clickFocus: ClickFocus
  showLines: boolean
  notesAside: boolean
  editing: boolean
  onView: (view: ModelView) => void
  onNotesMode: (mode: NotesMode) => void
  onClickFocus: (focus: ClickFocus) => void
  onToggleLines: () => void
  onToggleNotesAside: () => void
  onToggleEditing: () => void
  onSearch: () => void
  onAddEntity: () => void
  onAddNote: () => void
  /** Abre o tour do editor (ver `tour/`). */
  onTour: () => void
}


export default function Toolbar({
  title, subtitle, status, canEdit, view, canCompare, notesMode, noteCount,
  clickFocus, showLines, notesAside, editing, onView, onNotesMode, onClickFocus,
  onToggleLines, onToggleNotesAside, onToggleEditing, onSearch, onAddEntity, onAddNote, onTour,
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

            {/* Tudo o que muda o jeito de ver o desenho, num lugar so, como nos casos de uso:
                as notas, o que o clique numa tabela apaga e as linhas de ligacao. */}
            <DropMenu
              label={<><Icon name="eye" /><span className="btn__label">Ver</span></>}
              ariaLabel="Ver"
              tour="see"
              title="o que aparece no desenho: notas, foco ao clicar e linhas"
              active={notesMode !== 'markers' || clickFocus !== 'only' || !showLines || !notesAside}
            >
              <header className="menu__head">
                <span>notas</span>
                <em>{noteCount} no arquivo</em>
              </header>
              <MenuChoice
                name="notas"
                checked={notesMode === 'markers'}
                label="Resumidas"
                hint="a nota de uma tabela vira o marcador no cabeçalho dela, e o texto inteiro abre no painel"
                onChange={() => onNotesMode('markers')}
              />
              <MenuChoice
                name="notas"
                checked={notesMode === 'boxes'}
                label="Inteiras"
                hint="cada nota em caixa, no lugar gravado no arquivo"
                onChange={() => onNotesMode('boxes')}
              />
              <MenuChoice
                name="notas"
                checked={notesMode === 'hidden'}
                label="Ocultas"
                hint="só as tabelas e as ligações (Alt+3)"
                onChange={() => onNotesMode('hidden')}
              />

              <header className="menu__head menu__head--sec">
                <span>ao clicar numa tabela</span>
              </header>
              <MenuChoice
                name="foco"
                checked={clickFocus === 'only'}
                label="Só ela"
                hint="as outras tabelas apagam e as linhas somem"
                onChange={() => onClickFocus('only')}
              />
              <MenuChoice
                name="foco"
                checked={clickFocus === 'links'}
                label="Ela e as ligações"
                hint="ficam acesas ela, as tabelas ligadas a ela e as linhas entre elas"
                onChange={() => onClickFocus('links')}
              />
              <MenuChoice
                name="foco"
                checked={clickFocus === 'none'}
                label="Nada apaga"
                hint="todas as tabelas continuam acesas, e as linhas dela ganham destaque"
                onChange={() => onClickFocus('none')}
              />
              <hr className="menu__rule" />
              <MenuCheck
                checked={notesAside}
                off={notesMode === 'hidden'}
                label="Trazer as notas dela para o lado"
                hint={notesMode === 'hidden'
                  ? 'não vale com as notas ocultas'
                  : 'as notas da tabela clicada aparecem inteiras, numa coluna ao lado dela'}
                onChange={onToggleNotesAside}
              />

              <header className="menu__head menu__head--sec">
                <span>linhas</span>
              </header>
              <MenuCheck
                checked={showLines}
                label="Mostrar as linhas de ligação"
                hint="desmarcado, a linha só aparece ao passar o mouse numa tabela"
                onChange={onToggleLines}
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
