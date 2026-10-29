import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Viewport } from '@xyflow/react'

import Banners from '../shared/Banners'
import FileSidebar from '../shared/FileSidebar'
import EditorLayout from '../shared/Layout'
import { QuickFind, useQuickFindShortcut, type QuickFindItem } from '../shared/QuickFind'
import { environmentById } from '../shared/environments'
import { useLeaveGuard } from '../shared/navigation'
import { useEditorSession } from '../shared/session'
import { useStickyChoice } from '../shared/useResizable'
import { useStickyToggle } from '../shared/useStickyToggle'
import { useWorkspace } from '../shared/useWorkspace'
import ModelingGuide from '../tour/ModelingGuide'
import Tour from '../tour/Tour'
import Welcome, { wantsWelcome } from '../tour/Welcome'
import { tourTarget } from '../tour/targets'
import { MODELING_TOUR, stepsFor, type ModelingStage } from '../tour/steps'
import Toolbar from './components/Toolbar'
import Board, { type FocusRequest, type ModelView, type NotesMode } from './components/canvas/Board'
import Inspector from './components/inspector/Inspector'
import { MODELING_FORMAT } from './format'
import { useChanges } from './hooks/useChanges'
import { useModelActions } from './hooks/useModelActions'
import { COMMON_TYPES } from './model/constants'
import type { Position, Selection } from './types'

const ENV = environmentById('modeling')

const VIEWS: readonly ModelView[] = ['changes', 'all']
const NOTE_MODES: readonly NotesMode[] = ['markers', 'boxes', 'hidden']

/** Junta as três áreas da tela. A lógica de verdade mora nos hooks e em `model/`. */
export default function App() {
  const session = useEditorSession(ENV.id)
  const workspace = useWorkspace(ENV.collection, MODELING_FORMAT, session)
  const { doc, current, parseError } = workspace
  const [selection, setSelection] = useState<Selection>(null)

  // Sair pelo inicio ou pela aba do outro ambiente grava antes o que ficou pendente.
  useLeaveGuard(workspace.leave)

  // A pergunta "primeira vez aqui?": uma por entrada no ambiente, ate a caixinha dele
  // ser marcada (ver `tour/Welcome`). Trocar de arquivo aqui dentro nao pergunta de novo.
  const [welcome, setWelcome] = useState(() => wantsWelcome(ENV.id))

  const [showFiles, toggleFiles, setShowFiles] = useStickyToggle('modeling:files', true)
  const [showPanel, togglePanel, setShowPanel] = useStickyToggle('modeling:panel', true)
  const [view, setView] = useStickyChoice('modeling:view', VIEWS, 'changes')
  const [notesMode, setNotesMode] = useStickyChoice('modeling:notes-mode', NOTE_MODES, 'markers')
  // Abre em leitura: entender o arquivo nao pode correr o risco de mexer nele, que
  // grava sozinho. Editar e uma escolha, e fica lembrada.
  const [editing, toggleEditing] = useStickyToggle('modeling:editing', false)
  const locked = !editing

  const [searching, setSearching] = useState(false)
  const [focusRequest, setFocusRequest] = useState<FocusRequest>(null)
  const focusSeq = useRef(0)

  const changes = useChanges(workspace.files, current, doc)
  const canCompare = Boolean(changes.base)

  const canvasRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 })

  // Caixa nova nasce no meio do que está visível: criar fora da tela parece que não funcionou.
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

  /** Escolhe e leva o desenho ate a tabela ou a nota, pela lista de mudancas ou pela busca. */
  const go = useCallback((kind: 'entity' | 'note', uid: string): void => {
    // A nota presa a uma tabela nao existe no desenho como caixa resumida: quem leva
    // ate ela e a tabela, e o painel mostra o texto.
    const note = kind === 'note' ? doc?.notes.find((item) => item.uid === uid) : undefined
    const host = note && notesMode !== 'boxes' ? doc?.entities.find((entity) => entity.name === note.anchor) : undefined
    setSelection({ type: kind, uid })
    focusSeq.current += 1
    setFocusRequest(host
      ? { kind: 'entity', uid: host.uid, seq: focusSeq.current }
      : { kind, uid, seq: focusSeq.current })
  }, [doc, notesMode])

  /**
   * O que se escolhe no desenho aparece no painel, e o painel abre se estava
   * recolhido: escolher e nao ver nada parece clique perdido.
   */
  const selectFromCanvas = useCallback((next: Selection): void => {
    setSelection(next)
    if (next && !showPanel) togglePanel()
  }, [showPanel, togglePanel])

  const [notesFocus, setNotesFocus] = useState(0)
  /** A coluna que o desenho mandou abrir no painel. */
  const [fieldFocus, setFieldFocus] = useState<{ uid: string; seq: number } | null>(null)
  const editField = useCallback((entityUid: string, fieldUid: string): void => {
    setSelection({ type: 'entity', uid: entityUid })
    setFieldFocus((current) => ({ uid: fieldUid, seq: (current?.seq ?? 0) + 1 }))
    if (!showPanel) togglePanel()
  }, [showPanel, togglePanel])
  const showEntityNotes = useCallback((uid: string): void => {
    setSelection({ type: 'entity', uid })
    setNotesFocus((count) => count + 1)
    if (!showPanel) togglePanel()
  }, [showPanel, togglePanel])

  // Nota que saiu da tela nao pode continuar aberta no painel.
  useEffect(() => {
    if (notesMode === 'hidden') setSelection((selected) => (selected?.type === 'note' ? null : selected))
  }, [notesMode])

  // Criar nota com as notas escondidas pareceria que o botão não funcionou.
  const addNote = useCallback((): void => {
    if (notesMode === 'hidden') setNotesMode('boxes')
    actions.addNote()
  }, [notesMode, setNotesMode, actions])

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

  // Alt+1 / Alt+2 abrem e fecham as laterais, Alt+3 esconde as notas e Alt+E troca
  // entre leitura e edicao. `code`, e não `key`: no Mac, Alt+1 digita "¡".
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.altKey) return
      const action = {
        Digit1: toggleFiles,
        Digit2: togglePanel,
        Digit3: () => setNotesMode(notesMode === 'hidden' ? 'markers' : 'hidden'),
        KeyE: toggleEditing,
      }[event.code]
      if (!action) return
      event.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleFiles, togglePanel, toggleEditing, notesMode, setNotesMode])

  // O tour (ver `tour/`): guarda a tela de antes, e cada passo pede a dele. O que o
  // passo nao pede volta ao que era, e assim que voltar e sair desfazem.
  const [touring, setTouring] = useState(false)
  // A explicacao que o painel mostra no passo do tour, no lugar do de sempre.
  const [explain, setExplain] = useState<ModelingStage['explain'] | null>(null)
  const beforeTour = useRef<{ files: boolean; panel: boolean; view: ModelView } | null>(null)

  const startTour = useCallback((): void => {
    beforeTour.current = { files: showFiles, panel: showPanel, view }
    setSearching(false)
    setTouring(true)
  }, [showFiles, showPanel, view])

  const endTour = useCallback((): void => {
    setTouring(false)
    setExplain(null)
    beforeTour.current = null
  }, [])

  // O roteiro deste arquivo: sem comparacao, sem "Só o que mudou"; sem tabela nova
  // ou alterada, sem "Uma por uma".
  const hasChanges = [...(changes.changes?.entities.values() ?? [])].some((change) => change.kind === 'new' || change.kind === 'changed')
  const tourSteps = useMemo(
    () => stepsFor(MODELING_TOUR, { comparing: Boolean(changes.changes), 'has-changes': hasChanges }),
    [changes.changes, hasChanges],
  )

  const stageTour = (stage: ModelingStage | null): void => {
    const before = beforeTour.current
    if (!before) return
    const want = stage ?? {}
    setShowFiles(want.files ?? before.files)
    setShowPanel(want.panel ?? before.panel)
    setView(want.view ?? before.view)
    setExplain(want.explain ?? null)
  }

  // Trocar de arquivo por fora (o voltar do navegador) encerra o tour sem devolver nada.
  useEffect(endTour, [current])

  // "O time (08)": o arquivo comparado, pelo titulo, com o numero da lista.
  const baseEntry = workspace.files.find((file) => file.name === changes.base)
  const baseNumber = baseEntry && /^(\d+)-/.exec(baseEntry.name)?.[1]
  const baseTitle = !baseEntry ? ''
    : baseEntry.title ? (baseNumber ? `${baseEntry.title} (${baseNumber})` : baseEntry.title)
    : baseEntry.name.replace(/\.yaml$/, '')

  const canEdit = Boolean(doc) && !parseError
  const title = current
    ? doc?.meta.title || current.replace(/\.yaml$/, '')
    : 'nenhum arquivo aberto'
  const subtitle = !current ? ''
    : changes.base ? `${current.replace(/\.yaml$/, '')}, comparado com ${changes.base.replace(/\.yaml$/, '')}`
    : current.replace(/\.yaml$/, '')

  const searchItems = useMemo<QuickFindItem[]>(() => (doc?.entities ?? [])
    .map((entity) => {
      const kind = changes.changes?.entities.get(entity.name)?.kind
      return {
        id: entity.uid,
        title: entity.name,
        detail: entity.label,
        tag: kind === 'new' ? { text: 'nova', tone: 'new' as const }
          : kind === 'changed' ? { text: 'alterada', tone: 'changed' as const }
          : undefined,
      }
    })
    .sort((a, b) => a.title.localeCompare(b.title)), [doc, changes.changes])

  // A comparacao chegou, ou nao vai existir: e quando o desenho se enquadra no que mudou.
  const framingReady = !changes.base || Boolean(changes.changes) || Boolean(changes.error)

  return (
    <EditorLayout
      envClass="app--modeling"
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
          placeholder="Nova modelagem (nome em inglês)"
          onOpen={(name) => openFile(name)}
          onCreate={workspace.create}
          onDelete={workspace.remove}
          onCollapse={toggleFiles}
        />
      )}
      board={(
        <main className="board">
          {/* Sugestões do campo "tipo". Fica no topo porque é usada pelo painel e pelo
              canvas, e o painel pode estar fechado. */}
          <datalist id="common-types">
            {COMMON_TYPES.map((type) => <option key={type} value={type} />)}
          </datalist>

          <Toolbar
            title={title}
            subtitle={subtitle}
            status={workspace.status}
            canEdit={canEdit}
            view={view}
            canCompare={canCompare}
            notesMode={notesMode}
            noteCount={doc?.notes.length ?? 0}
            editing={editing}
            onView={setView}
            onNotesMode={setNotesMode}
            onToggleEditing={toggleEditing}
            onSearch={openSearch}
            onAddEntity={actions.addEntity}
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
                // aberto, medida dos nós) passa de um arquivo para o outro.
                key={current ?? ''}
                doc={doc}
                changes={changes.changes}
                framingReady={framingReady}
                view={canCompare ? view : 'all'}
                notesMode={notesMode}
                locked={locked}
                selection={selection}
                onSelect={selectFromCanvas}
                actions={actions}
                focusRequest={focusRequest}
                onShowEntityNotes={showEntityNotes}
                onEditField={editField}
                onRequestEdit={toggleEditing}
                onViewportChange={(viewport) => { viewportRef.current = viewport }}
              />
            ) : (
              <div className="empty-state">
                <p>Escolha uma modelagem na lista, ou crie uma nova.</p>
              </div>
            )}
          </div>

          {/* A pergunta espera o arquivo e a comparacao: os passos do tour dependem dos dois. */}
          {welcome && doc && canEdit && framingReady && (
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
              placeholder="buscar tabela pelo nome…"
              onPick={(uid) => go('entity', uid)}
              onClose={() => setSearching(false)}
            />
          )}
        </main>
      )}
      panel={doc && canEdit && (explain ? (
        <ModelingGuide topic={explain} doc={doc} changes={changes.changes} baseTitle={baseTitle} />
      ) : (
        <Inspector
          doc={doc}
          selection={selection}
          actions={actions}
          changes={changes}
          locked={locked}
          onSelect={setSelection}
          onGo={go}
          notesFocus={notesFocus}
          fieldFocus={fieldFocus}
        />
      ))}
    />
  )
}
