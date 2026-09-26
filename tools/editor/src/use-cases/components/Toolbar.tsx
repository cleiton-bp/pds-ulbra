import { useEffect, useRef, useState } from 'react'
import HomeButton from '../../shared/HomeButton'
import type { SaveStatus } from '../../shared/useWorkspace'

type ToolbarProps = {
  title: string
  status: SaveStatus
  canEdit: boolean
  showFiles: boolean
  showPanel: boolean
  showNotes: boolean
  showBoundary: boolean
  focus: boolean
  /** Quantas notas o arquivo tem, para o menu dizer o tamanho do que mexe. */
  noteCount: number
  onToggleFiles: () => void
  onTogglePanel: () => void
  onToggleNotes: () => void
  onToggleBoundary: () => void
  onToggleFocus: () => void
  onAddActor: () => void
  onAddUseCase: () => void
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
  title, status, canEdit, showFiles, showPanel, showNotes, showBoundary, focus, noteCount,
  onToggleFiles, onTogglePanel, onToggleNotes, onToggleBoundary, onToggleFocus,
  onAddActor, onAddUseCase, onAddNote,
}: ToolbarProps) {
  const [openMenu, setOpenMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Menu aberto fecha com clique fora ou Escape — so enquanto esta aberto, para nao
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
      {/* Voltar e abrir a lista andam juntos: sao o caminho de volta, nao acoes do arquivo. */}
      <div className="toolbar__nav">
        <HomeButton />
        <button
          className={`icon-btn${showFiles ? ' is-on' : ''}`}
          title={showFiles ? 'esconder a lista de arquivos' : 'mostrar a lista de arquivos'}
          aria-pressed={showFiles}
          onClick={onToggleFiles}
        >
          ☰
        </button>
      </div>

      <h2 className="toolbar__title">{title}</h2>

      <div className="toolbar__actions">
        {canEdit && (
          <>
            <button className="btn" onClick={onAddActor}>+ ator</button>
            <button className="btn" onClick={onAddUseCase}>+ caso de uso</button>
            <button className="btn" onClick={onAddNote}>+ nota</button>
            {/* Divide o que cria do que muda a vista: sem a barra, o menu parece
                mais uma coisa para adicionar. */}
            <span className="toolbar__sep" aria-hidden="true" />
            <div className="menu" ref={menuRef}>
              <button
                className={`btn${focus ? ' is-on' : ''}`}
                aria-haspopup="true"
                aria-expanded={openMenu}
                title="o que aparece no canvas: notas, fronteira e realce"
                onClick={() => setOpenMenu((open) => !open)}
              >
                o que aparece ▾
              </button>

              {openMenu && (
                <div className="menu__pop">
                  <header className="menu__head">
                    <span>notas</span>
                    <em>{showNotes ? noteCount : 0} de {noteCount} na tela</em>
                  </header>

                  <label className="menu__item">
                    <input type="checkbox" checked={showNotes} onChange={onToggleNotes} />
                    <span>
                      mostrar as notas
                      <small>desmarcado, fica só o diagrama · Alt+3</small>
                    </span>
                  </label>

                  <header className="menu__head menu__head--sec">
                    <span>diagrama</span>
                  </header>

                  <label className="menu__item">
                    <input type="checkbox" checked={showBoundary} onChange={onToggleBoundary} />
                    <span>
                      mostrar a fronteira do sistema
                      <small>o retângulo em volta dos casos de uso, com o nome do sistema</small>
                    </span>
                  </label>

                  <label className="menu__item">
                    <input type="checkbox" checked={focus} onChange={onToggleFocus} />
                    <span>
                      realçar quem faz o quê
                      <small>
                        escolha um ator e acende o que ele realiza; escolha um caso de uso e
                        acende quem o realiza · Alt+4
                      </small>
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
