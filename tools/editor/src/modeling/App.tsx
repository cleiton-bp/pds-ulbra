import { useCallback, useEffect, useRef, useState } from 'react'
import type { Viewport } from '@xyflow/react'

import Banners from '../shared/Banners'
import FileSidebar from '../shared/FileSidebar'
import { useStickyToggle } from '../shared/useStickyToggle'
import { useWorkspace } from '../shared/useWorkspace'
import Toolbar from './components/Toolbar'
import Board from './components/canvas/Board'
import Inspector from './components/inspector/Inspector'
import { useModelActions } from './hooks/useModelActions'
import { COMMON_TYPES } from './model/constants'
import type { Position, Selection } from './types'

/** Junta as três áreas da tela. A lógica de verdade mora nos hooks e em `model/`. */
export default function App() {
  const workspace = useWorkspace()
  const { doc, current, parseError } = workspace
  const [selection, setSelection] = useState<Selection>(null)

  const [showFiles, toggleFiles] = useStickyToggle('editor:files', true)
  const [showPanel, togglePanel] = useStickyToggle('editor:panel', true)
  const [showNotes, toggleNotes] = useStickyToggle('editor:notes', true)
  const [hideInherited, toggleInherited] = useStickyToggle('editor:notes-herdadas', false)
  const [focusNotes, toggleFocus] = useStickyToggle('editor:notes-realce', false)
  const [focusNew, toggleFocusNew] = useStickyToggle('editor:tabelas-realce', false)

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

  // Nota que saiu da tela não pode continuar aberta no painel — nem a escondida pelo
  // liga/desliga, nem a que o filtro de herdadas tirou.
  useEffect(() => {
    setSelection((selected) => {
      if (selected?.type !== 'note') return selected
      if (!showNotes) return null
      const note = doc?.notes.find((n) => n.uid === selected.uid)
      return note && hideInherited && note.inherited ? null : selected
    })
  }, [showNotes, hideInherited, doc])

  // Criar nota com as notas escondidas pareceria que o botão não funcionou.
  const addNote = useCallback((): void => {
    if (!showNotes) toggleNotes()
    actions.addNote()
  }, [showNotes, toggleNotes, actions])

  const openFile = useCallback((name: string): void => {
    setSelection(null)
    void workspace.open(name)
  }, [workspace])

  // Alt+1 / Alt+2 abrem e fecham as laterais, Alt+3 esconde as notas — sem tirar a mão do teclado.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.altKey) return
      if (event.key === '1') { event.preventDefault(); toggleFiles() }
      if (event.key === '2') { event.preventDefault(); togglePanel() }
      if (event.key === '3') { event.preventDefault(); toggleNotes() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleFiles, togglePanel, toggleNotes])

  const canEdit = Boolean(doc) && !parseError
  const title = current
    ? doc?.meta.title || current.replace(/\.yaml$/, '')
    : 'nenhum arquivo aberto'

  const layout = [
    'app',
    'app--modeling',
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
          showNotes={showNotes}
          hideInherited={hideInherited}
          focusNotes={focusNotes}
          noteCount={doc?.notes.length ?? 0}
          inheritedCount={doc?.notes.filter((note) => note.inherited).length ?? 0}
          entityCount={doc?.entities.length ?? 0}
          newEntityCount={doc?.entities.filter((entity) => !entity.inherited).length ?? 0}
          focusNew={focusNew}
          onToggleFiles={toggleFiles}
          onTogglePanel={togglePanel}
          onToggleNotes={toggleNotes}
          onToggleInherited={toggleInherited}
          onToggleFocus={toggleFocus}
          onToggleFocusNew={toggleFocusNew}
          onAddEntity={actions.addEntity}
          onAddNote={addNote}
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
              showNotes={showNotes}
              hideInherited={hideInherited}
              focusNotes={focusNotes}
              focusNew={focusNew}
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
