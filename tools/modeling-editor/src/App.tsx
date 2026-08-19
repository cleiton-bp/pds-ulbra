import { useCallback, useEffect, useRef, useState } from 'react'
import type { Viewport } from '@xyflow/react'

import Banners from './components/Banners'
import FileSidebar from './components/FileSidebar'
import Toolbar from './components/Toolbar'
import Board from './components/canvas/Board'
import Inspector from './components/inspector/Inspector'
import { useModelActions } from './hooks/useModelActions'
import { useStickyToggle } from './hooks/useStickyToggle'
import { useWorkspace } from './hooks/useWorkspace'
import { COMMON_TYPES } from './model/constants'
import type { Position, Selection } from './types'

/** Junta as três áreas da tela. A lógica de verdade mora nos hooks e em `model/`. */
export default function App() {
  const workspace = useWorkspace()
  const [selection, setSelection] = useState<Selection>(null)

  const [showFiles, toggleFiles] = useStickyToggle('editor:files', true)
  const [showPanel, togglePanel] = useStickyToggle('editor:panel', true)

  const canvasRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 })

  // Caixa nova nasce no meio do que está visível — criar fora da tela parece que não funcionou.
  const nextPosition = useCallback((): Position => {
    const box = canvasRef.current?.getBoundingClientRect()
    if (!box) return { x: 80, y: 80 }
    const { x, y, zoom } = viewportRef.current
    return {
      x: Math.round((-x + box.width / 2) / zoom) - 110,
      y: Math.round((-y + box.height / 2) / zoom) - 60,
    }
  }, [])

  const actions = useModelActions({ update: workspace.update, setSelection, nextPosition })

  const openFile = useCallback((name: string): void => {
    setSelection(null)
    void workspace.open(name)
  }, [workspace])

  // Alt+1 / Alt+2 abrem e fecham as laterais sem tirar a mão do teclado.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.altKey) return
      if (event.key === '1') { event.preventDefault(); toggleFiles() }
      if (event.key === '2') { event.preventDefault(); togglePanel() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleFiles, togglePanel])

  const { doc, current, parseError } = workspace
  const canEdit = Boolean(doc) && !parseError
  const title = current
    ? doc?.meta.title || current.replace(/\.yaml$/, '')
    : 'nenhum arquivo aberto'

  const layout = [
    'app',
    showFiles ? '' : 'app--no-files',
    showPanel ? '' : 'app--no-panel',
    canEdit ? '' : 'app--no-doc',
  ].filter(Boolean).join(' ')

  return (
    <div className={layout}>
      {/* Sugestões do campo "tipo". Fica no topo porque é usada pelo painel e pelo
          canvas, e o painel pode estar fechado. */}
      <datalist id="common-types">
        {COMMON_TYPES.map((type) => <option key={type} value={type} />)}
      </datalist>

      <FileSidebar
        files={workspace.files}
        current={current}
        dir={workspace.dir}
        onOpen={openFile}
        onCreate={workspace.create}
        onDelete={(name) => void workspace.remove(name)}
      />

      <main className="board">
        <Toolbar
          title={title}
          status={workspace.status}
          canEdit={canEdit}
          showFiles={showFiles}
          showPanel={showPanel}
          onToggleFiles={toggleFiles}
          onTogglePanel={togglePanel}
          onAddEntity={actions.addEntity}
          onAddNote={actions.addNote}
        />

        <Banners
          conflict={workspace.conflict}
          parseError={parseError}
          saveError={workspace.saveError}
          onReload={() => current && openFile(current)}
          onForceSave={() => void workspace.save({ force: true })}
          onDismissError={workspace.dismissError}
        />

        <div className="canvas" ref={canvasRef}>
          {doc && canEdit ? (
            <Board
              doc={doc}
              selection={selection}
              onSelect={setSelection}
              actions={actions}
              onViewportChange={(viewport) => { viewportRef.current = viewport }}
            />
          ) : (
            <div className="empty-state">
              <p>Escolha uma modelagem na lista, ou crie uma nova.</p>
            </div>
          )}
        </div>
      </main>

      {doc && canEdit && <Inspector doc={doc} selection={selection} actions={actions} />}
    </div>
  )
}
