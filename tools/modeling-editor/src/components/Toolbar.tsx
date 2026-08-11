import type { SaveStatus } from '../hooks/useWorkspace'

type ToolbarProps = {
  title: string
  status: SaveStatus
  canEdit: boolean
  showFiles: boolean
  showPanel: boolean
  onToggleFiles: () => void
  onTogglePanel: () => void
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
  onToggleFiles, onTogglePanel, onAddEntity, onAddNote,
}: ToolbarProps) {
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
