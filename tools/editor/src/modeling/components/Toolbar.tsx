import { useEffect, useRef, useState } from 'react'
import type { SaveStatus } from '../../shared/useWorkspace'

type ToolbarProps = {
  title: string
  status: SaveStatus
  canEdit: boolean
  showFiles: boolean
  showPanel: boolean
  showNotes: boolean
  hideInherited: boolean
  focusNotes: boolean
  focusNew: boolean
  /** Quantas notas o arquivo tem, para o menu dizer o tamanho do que mexe. */
  noteCount: number
  /** Quantas delas vieram da modelagem anterior. */
  inheritedCount: number
  /** Tabelas no arquivo, e quantas delas esta modelagem acrescenta. */
  entityCount: number
  newEntityCount: number
  onToggleFiles: () => void
  onTogglePanel: () => void
  onToggleNotes: () => void
  onToggleInherited: () => void
  onToggleFocus: () => void
  onToggleFocusNew: () => void
  onAddEntity: () => void
  onAddNote: () => void
}

// O estado vem em ingles do `useWorkspace`; a traducao para a tela e aqui.
const STATUS_LABEL: Record<SaveStatus, string> = {
  empty: '',
  saved: 'gravado',
  unsaved: 'não gravado',
  saving: 'gravando…',
  error: 'erro',
  conflict: 'conflito',
}

export default function Toolbar({
  title, status, canEdit, showFiles, showPanel,
  showNotes, hideInherited, focusNotes, focusNew,
  noteCount, inheritedCount, entityCount, newEntityCount,
  onToggleFiles, onTogglePanel, onToggleNotes, onToggleInherited, onToggleFocus,
  onToggleFocusNew, onAddEntity, onAddNote,
}: ToolbarProps) {
  const [openMenu, setOpenMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Quantas notas o canvas está mostrando agora, contando os dois filtros.
  const onScreen = !showNotes ? 0 : hideInherited ? noteCount - inheritedCount : noteCount

  // Menu aberto fecha com clique fora ou Escape — só enquanto está aberto, para não
  // deixar dois ouvintes no documento a vida inteira.
  useEffect(() => {
    if (!openMenu) return
    const onDown = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setOpenMenu(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpenMenu(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openMenu])

  return (
    <header className="toolbar">
      <button
        className={`icon-btn${showFiles ? ' is-on' : ''}`}
        title={showFiles ? 'esconder a lista de arquivos' : 'mostrar a lista de arquivos'}
        aria-pressed={showFiles}
        onClick={onToggleFiles}
      >
        ☰
      </button>

      <h2 className="toolbar__title">{title}</h2>

      <div className="toolbar__actions">
        {canEdit && (
          <>
            <button className="btn" onClick={onAddEntity}>+ entidade</button>
            <button className="btn" onClick={onAddNote}>+ nota</button>
            {/* Divide o que cria do que muda a vista: sem a barra, o terceiro botão
                parece mais uma coisa para adicionar. */}
            <span className="toolbar__sep" aria-hidden="true" />
            <div className="menu" ref={menuRef}>
              <button
                className={`btn${showNotes ? '' : ' is-off'}`}
                aria-haspopup="true"
                aria-expanded={openMenu}
                title="o que aparece no canvas: notas e realce das tabelas novas"
                onClick={() => setOpenMenu((open) => !open)}
              >
                o que aparece ▾
              </button>

              {openMenu && (
                <div className="menu__pop">
                  <header className="menu__head">
                    <span>notas</span>
                    <em>{onScreen} de {noteCount} na tela</em>
                  </header>

                  <label className="menu__item">
                    <input type="checkbox" checked={showNotes} onChange={onToggleNotes} />
                    <span>
                      mostrar as notas
                      <small>desmarcado, fica só a modelagem · Alt+3</small>
                    </span>
                  </label>

                  {/* A linha marca a hierarquia: acima o liga/desliga, abaixo o que
                      refina, e refinar sem as notas na tela não faz sentido. */}
                  <hr className="menu__rule" />

                  <label className={`menu__item${showNotes ? '' : ' is-off'}`}>
                    <input
                      type="checkbox"
                      checked={hideInherited}
                      disabled={!showNotes}
                      onChange={onToggleInherited}
                    />
                    <span>
                      só as desta modelagem
                      <small>
                        esconde as {inheritedCount} que vieram do arquivo anterior
                      </small>
                    </span>
                  </label>

                  <label className={`menu__item${showNotes ? '' : ' is-off'}`}>
                    <input
                      type="checkbox"
                      checked={focusNotes}
                      disabled={!showNotes}
                      onChange={onToggleFocus}
                    />
                    <span>
                      realçar as da tabela escolhida
                      <small>as notas dela acendem e as outras apagam</small>
                    </span>
                  </label>

                  <header className="menu__head menu__head--sec">
                    <span>tabelas</span>
                    <em>{newEntityCount} novas de {entityCount}</em>
                  </header>

                  <label className="menu__item">
                    <input type="checkbox" checked={focusNew} onChange={onToggleFocusNew} />
                    <span>
                      realçar as tabelas novas
                      <small>as que vieram de antes apagam, sem sumir</small>
                    </span>
                  </label>
                </div>
              )}
            </div>
          </>
        )}
        {status !== 'empty' && (
          <span className={`status status--${status}`}>{STATUS_LABEL[status]}</span>
        )}
        <button
          className={`icon-btn${showPanel ? ' is-on' : ''}`}
          title={showPanel ? 'esconder o painel' : 'mostrar o painel'}
          aria-pressed={showPanel}
          onClick={onTogglePanel}
        >
          ▤
        </button>
      </div>
    </header>
  )
}
