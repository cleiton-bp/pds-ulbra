import { useCallback, useEffect, useRef, useState } from 'react'
import type { Viewport } from '@xyflow/react'

import Banners from '../shared/Banners'
import FileSidebar from '../shared/FileSidebar'
import { environmentById } from '../shared/environments'
import { useLeaveGuard } from '../shared/navigation'
import { useEditorSession } from '../shared/session'
import { useStickyToggle } from '../shared/useStickyToggle'
import { useWorkspace } from '../shared/useWorkspace'
import Toolbar from './components/Toolbar'
import Board, { type MeasuredSizes } from './components/canvas/Board'
import Inspector from './components/inspector/Inspector'
import { USE_CASE_FORMAT } from './format'
import { useDiagramActions } from './hooks/useDiagramActions'
import type { Position, Selection } from './types'

const ENV = environmentById('use-cases')

/** Junta as tres areas da tela. A logica de verdade mora nos hooks e em `model/`. */
export default function App() {
  const session = useEditorSession(ENV.id)
  const workspace = useWorkspace(ENV.collection, USE_CASE_FORMAT, session)
  const { doc, current, parseError } = workspace
  const [selection, setSelection] = useState<Selection>(null)

  // Sair pelo inicio ou pela aba do outro ambiente grava antes o que ficou pendente.
  useLeaveGuard(workspace.leave)

  const [showFiles, toggleFiles] = useStickyToggle('use-cases:files', true)
  const [showPanel, togglePanel] = useStickyToggle('use-cases:panel', true)
  const [showNotes, toggleNotes] = useStickyToggle('use-cases:notes', true)
  const [showBoundary, toggleBoundary] = useStickyToggle('use-cases:boundary', true)
  const [focus, toggleFocus] = useStickyToggle('use-cases:focus', false)

  const canvasRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 })
  // O tamanho medido de cada elemento, que o canvas preenche — para o elemento novo
  // nao nascer em cima de uma nota alta ou de um nome de ator comprido.
  const sizesRef = useRef<MeasuredSizes>({})

  // Elemento novo nasce no meio do que esta visivel — criar fora da tela parece que nao funcionou.
  const visibleCenter = useCallback((): Position => {
    const box = canvasRef.current?.getBoundingClientRect()
    if (!box) return { x: 200, y: 160 }
    const { x, y, zoom } = viewportRef.current
    return {
      x: Math.round((-x + box.width / 2) / zoom),
      y: Math.round((-y + box.height / 2) / zoom),
    }
  }, [])

  const actions = useDiagramActions({ update: workspace.update, setSelection, visibleCenter, sizesRef })

  // Nota que saiu da tela nao pode continuar aberta no painel.
  useEffect(() => {
    if (!showNotes) setSelection((selected) => (selected?.type === 'note' ? null : selected))
  }, [showNotes])

  // Criar nota com as notas escondidas pareceria que o botao nao funcionou.
  const addNote = useCallback((): void => {
    if (!showNotes) toggleNotes()
    actions.addNote()
  }, [showNotes, toggleNotes, actions])

  const { open } = workspace
  const openFile = useCallback((name: string, discard = false): void => {
    setSelection(null)
    void open(name, { discard })
  }, [open])

  // Arquivo pedido pelo endereco depois da entrada (link colado, voltar do navegador).
  const { requestedFile } = session
  useEffect(() => {
    if (requestedFile && requestedFile !== workspace.current) openFile(requestedFile)
    // So quando o endereco pede outro arquivo — nao a cada arquivo aberto pela lista.
  }, [requestedFile])

  // Alt+1 / Alt+2 abrem e fecham as laterais, Alt+3 esconde as notas e Alt+4 liga o
  // realce — sem tirar a mao do teclado. `code`, e nao `key`: no Mac, Alt+1 digita "¡".
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.altKey) return
      const toggle = {
        Digit1: toggleFiles, Digit2: togglePanel, Digit3: toggleNotes, Digit4: toggleFocus,
      }[event.code]
      if (!toggle) return
      event.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleFiles, togglePanel, toggleNotes, toggleFocus])

  const canEdit = Boolean(doc) && !parseError
  const title = current
    ? doc?.meta.title || current.replace(/\.yaml$/, '')
    : 'nenhum arquivo aberto'

  const layout = [
    'app',
    'app--use-cases',
    showFiles ? '' : 'app--no-files',
    showPanel ? '' : 'app--no-panel',
    canEdit ? '' : 'app--no-doc',
  ].filter(Boolean).join(' ')

  return (
    <div className={layout}>
      <FileSidebar
        env={ENV}
        files={workspace.files}
        current={current}
        dir={workspace.dir}
        placeholder="novo arquivo (nome em inglês)…"
        onOpen={(name) => openFile(name)}
        onCreate={workspace.create}
        onDelete={workspace.remove}
      />

      <main className="board">
        <Toolbar
          title={title}
          status={workspace.status}
          canEdit={canEdit}
          showFiles={showFiles}
          showPanel={showPanel}
          showNotes={showNotes}
          showBoundary={showBoundary}
          focus={focus}
          noteCount={doc?.notes.length ?? 0}
          onToggleFiles={toggleFiles}
          onTogglePanel={togglePanel}
          onToggleNotes={toggleNotes}
          onToggleBoundary={toggleBoundary}
          onToggleFocus={toggleFocus}
          onAddActor={actions.addActor}
          onAddUseCase={actions.addUseCase}
          onAddNote={addNote}
        />

        <Banners
          conflict={workspace.conflict}
          parseError={parseError}
          saveError={workspace.saveError}
          comments={workspace.comments}
          missing={workspace.missing}
          onReload={() => current && openFile(current, true)}
          onForceSave={() => void workspace.save({ force: true })}
          onDismissError={workspace.dismissError}
          onDropComments={workspace.dropComments}
          onRecreate={() => void workspace.recreate()}
          onClose={workspace.close}
        />

        <div className="canvas" ref={canvasRef}>
          {doc && canEdit ? (
            <Board
              // Um Board por arquivo: cada um abre enquadrado, e nada de tela (texto
              // aberto, medida dos nos) passa de um arquivo para o outro.
              key={current ?? ''}
              doc={doc}
              showNotes={showNotes}
              showBoundary={showBoundary}
              focus={focus}
              selection={selection}
              onSelect={setSelection}
              actions={actions}
              sizesRef={sizesRef}
              onViewportChange={(viewport) => { viewportRef.current = viewport }}
            />
          ) : (
            <div className="empty-state">
              <p>Escolha um arquivo de casos de uso na lista, ou crie um novo.</p>
            </div>
          )}
        </div>
      </main>

      {doc && canEdit && (
        <Inspector doc={doc} selection={selection} actions={actions} onSelect={setSelection} />
      )}
    </div>
  )
}
