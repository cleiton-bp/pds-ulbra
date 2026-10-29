import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Viewport } from '@xyflow/react'

import Banners from '../shared/Banners'
import FileSidebar from '../shared/FileSidebar'
import EditorLayout from '../shared/Layout'
import { QuickFind, useQuickFindShortcut, type QuickFindItem } from '../shared/QuickFind'
import { environmentById } from '../shared/environments'
import { useLeaveGuard } from '../shared/navigation'
import { useEditorSession } from '../shared/session'
import { useStickyToggle } from '../shared/useStickyToggle'
import { useWorkspace } from '../shared/useWorkspace'
import Tour from '../tour/Tour'
import UseCasesGuide from '../tour/UseCasesGuide'
import Welcome, { wantsWelcome } from '../tour/Welcome'
import { USE_CASES_TOUR, stepsFor, type Explain, type UseCasesStage } from '../tour/steps'
import { tourTarget } from '../tour/targets'
import Toolbar from './components/Toolbar'
import Board, { type FocusRequest, type MeasuredSizes } from './components/canvas/Board'
import { nodeId } from './components/canvas/nodeTypes'
import Inspector from './components/inspector/Inspector'
import { USE_CASE_FORMAT } from './format'
import { useDiagramActions, type DiagramActions } from './hooks/useDiagramActions'
import type { Position, Selection } from './types'

const ENV = environmentById('use-cases')

/**
 * As acoes do painel em "Leitura": todas existem, e nenhuma muda o documento. Os
 * campos continuam a vista para ler: digitar neles nao tem efeito, e o CSS de
 * `.panel.is-locked` tira deles a cara de campo e esconde os botoes de mudar.
 */
const READ_ONLY = new Proxy({}, { get: () => () => undefined }) as DiagramActions

/** Junta as tres areas da tela. A logica de verdade mora nos hooks e em `model/`. */
export default function App() {
  const session = useEditorSession(ENV.id)
  const workspace = useWorkspace(ENV.collection, USE_CASE_FORMAT, session)
  const { doc, current, parseError } = workspace
  const [selection, setSelection] = useState<Selection>(null)

  // Sair pelo inicio ou pela aba do outro ambiente grava antes o que ficou pendente.
  useLeaveGuard(workspace.leave)

  // A pergunta "primeira vez aqui?": uma por entrada no ambiente, ate a caixinha dele
  // ser marcada (ver `tour/Welcome`). Trocar de arquivo aqui dentro nao pergunta de novo.
  const [welcome, setWelcome] = useState(() => wantsWelcome(ENV.id))

  const [showFiles, toggleFiles, setShowFiles] = useStickyToggle('use-cases:files', true)
  const [showPanel, togglePanel, setShowPanel] = useStickyToggle('use-cases:panel', true)
  const [showNotes, toggleNotes] = useStickyToggle('use-cases:notes', true)
  const [showBoundary, toggleBoundary] = useStickyToggle('use-cases:boundary', true)
  const [focus, toggleFocus] = useStickyToggle('use-cases:focus', false)
  // Abre em leitura, como a modelagem: entender nao pode correr o risco de mexer no
  // arquivo, que grava sozinho.
  const [editing, toggleEditing] = useStickyToggle('use-cases:editing', false)
  const locked = !editing

  const [searching, setSearching] = useState(false)
  const [focusRequest, setFocusRequest] = useState<FocusRequest>(null)
  const focusSeq = useRef(0)

  const canvasRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 })
  // O tamanho medido de cada elemento, que o canvas preenche, para o elemento novo
  // nao nascer em cima de uma nota alta ou de um nome de ator comprido.
  const sizesRef = useRef<MeasuredSizes>({})

  // Elemento novo nasce no meio do que esta visivel: criar fora da tela parece que nao funcionou.
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
    // So quando o endereco pede outro arquivo, nao a cada arquivo aberto pela lista.
  }, [requestedFile])

  const openSearch = useCallback(() => { if (doc) setSearching(true) }, [doc])
  useQuickFindShortcut(openSearch)

  // Alt+1 / Alt+2 abrem e fecham as laterais, Alt+3 esconde as notas, Alt+4 liga o
  // realce e Alt+E troca entre leitura e edicao. `code`, e nao `key`: no Mac, Alt+1
  // digita "¡".
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.altKey) return
      const toggle = {
        Digit1: toggleFiles, Digit2: togglePanel, Digit3: toggleNotes, Digit4: toggleFocus, KeyE: toggleEditing,
      }[event.code]
      if (!toggle) return
      event.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleFiles, togglePanel, toggleNotes, toggleFocus, toggleEditing])

  // O tour (ver `tour/`): guarda a tela de antes, e cada passo pede a dele. O que o
  // passo nao pede volta ao que era, e assim que voltar e sair desfazem.
  const [touring, setTouring] = useState(false)
  // A explicacao que o painel mostra no passo do tour, no lugar do de sempre.
  const [explain, setExplain] = useState<Explain | null>(null)
  const beforeTour = useRef<{ files: boolean; panel: boolean } | null>(null)

  const startTour = useCallback((): void => {
    beforeTour.current = { files: showFiles, panel: showPanel }
    setSearching(false)
    setTouring(true)
  }, [showFiles, showPanel])

  const endTour = useCallback((): void => {
    setTouring(false)
    setExplain(null)
    beforeTour.current = null
  }, [])

  const stageTour = (stage: UseCasesStage | null): void => {
    const before = beforeTour.current
    if (!before) return
    const want = stage ?? {}
    setShowFiles(want.files ?? before.files)
    setShowPanel(want.panel ?? before.panel)
    setExplain(want.explain ?? null)
  }

  // Trocar de arquivo por fora (o voltar do navegador) encerra o tour sem devolver nada.
  useEffect(endTour, [current])

  // O roteiro deste arquivo: sem caso com os passos escritos, sem "Por dentro".
  const hasFlow = Boolean(doc?.useCases.some((useCase) => useCase.mainFlow.length > 0))
  const tourSteps = useMemo(() => stepsFor(USE_CASES_TOUR, { 'has-flow': hasFlow }), [hasFlow])

  const canEdit = Boolean(doc) && !parseError
  const title = current
    ? doc?.meta.title || current.replace(/\.yaml$/, '')
    : 'nenhum arquivo aberto'

  const searchItems = useMemo<QuickFindItem[]>(() => [
    ...(doc?.actors ?? []).map((actor) => ({ id: `actor:${actor.uid}`, title: actor.name || 'sem nome', detail: 'ator' })),
    ...(doc?.useCases ?? []).map((useCase) => ({
      id: `useCase:${useCase.uid}`,
      title: useCase.id || 'sem código',
      detail: useCase.name || 'sem nome',
    })),
  ], [doc])

  const pick = useCallback((id: string): void => {
    const [type, uid = ''] = id.split(':')
    if (type !== 'actor' && type !== 'useCase') return
    setSelection({ type, uid })
    focusSeq.current += 1
    setFocusRequest({ nodeId: type === 'actor' ? nodeId.actor(uid) : nodeId.useCase(uid), seq: focusSeq.current })
  }, [])

  return (
    <EditorLayout
      envClass="app--use-cases"
      showFiles={showFiles}
      showPanel={showPanel}
      hasDoc={Boolean(doc) && canEdit}
      onToggleFiles={toggleFiles}
      onTogglePanel={togglePanel}
      files={(
        <FileSidebar
          env={ENV}
          files={workspace.files}
          current={current}
          placeholder="Novo arquivo (nome em inglês)"
          onOpen={(name) => openFile(name)}
          onCreate={workspace.create}
          onDelete={workspace.remove}
          onCollapse={toggleFiles}
        />
      )}
      board={(
        <main className="board">
          <Toolbar
            title={title}
            subtitle={current ? current.replace(/\.yaml$/, '') : ''}
            status={workspace.status}
            canEdit={canEdit}
            showNotes={showNotes}
            showBoundary={showBoundary}
            focus={focus}
            noteCount={doc?.notes.length ?? 0}
            editing={editing}
            onToggleNotes={toggleNotes}
            onToggleBoundary={toggleBoundary}
            onToggleFocus={toggleFocus}
            onToggleEditing={toggleEditing}
            onSearch={openSearch}
            onAddActor={actions.addActor}
            onAddUseCase={actions.addUseCase}
            onAddNote={addNote}
            onTour={startTour}
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

          <div {...tourTarget('canvas')} className="canvas" ref={canvasRef}>
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
                locked={locked}
                focusRequest={focusRequest}
                onViewportChange={(viewport) => { viewportRef.current = viewport }}
              />
            ) : (
              <div className="empty-state">
                <p>Escolha um arquivo de casos de uso na lista, ou crie um novo.</p>
              </div>
            )}
          </div>

          {/* A pergunta espera o arquivo abrir: o tour explica o que esta aberto. */}
          {welcome && doc && canEdit && (
            <Welcome env={ENV.id} onAnswer={(start) => { setWelcome(false); if (start) startTour() }} />
          )}

          {touring && (
            <Tour
              steps={tourSteps}
              stage={stageTour}
              onClose={endTour}
            />
          )}

          {searching && (
            <QuickFind
              items={searchItems}
              placeholder="buscar ator ou caso de uso…"
              onPick={pick}
              onClose={() => setSearching(false)}
            />
          )}
        </main>
      )}
      panel={doc && canEdit && (explain ? (
        <UseCasesGuide topic={explain} doc={doc} />
      ) : (
        <Inspector
          doc={doc}
          selection={selection}
          actions={locked ? READ_ONLY : actions}
          locked={locked}
          onSelect={setSelection}
        />
      ))}
    />
  )
}
