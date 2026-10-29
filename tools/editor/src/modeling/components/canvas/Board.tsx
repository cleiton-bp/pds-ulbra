import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Background,
  ConnectionMode,
  MarkerType,
  MiniMap,
  ReactFlow,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type NodeChange,
  type Viewport,
} from '@xyflow/react'

import ZoomBar from '../../../shared/ZoomBar'
import type { ModelActions } from '../../hooks/useModelActions'
import { relationLabel } from '../../model/constants'
import { noteKey, relationKey, type ChangeSet } from '../../model/diff'
import { boxCenter, pickSides } from '../../model/geometry'
import type { Entity, ModelDoc, Note, Selection, Side } from '../../types'
import EntityNode from './EntityNode'
import NoteNode from './NoteNode'
import Icon from '../../../shared/Icon'
import { CanvasEditingProvider, type InlineEditing } from './EditingContext'
import {
  edgeId, handleId, nodeId, parseEdgeId, parseHandleId, parseNodeId, type AppNode,
} from './nodeTypes'

const NODE_TYPES = { entity: EntityNode, note: NoteNode }

/**
 * Abaixo deste zoom o desenho e lido "de longe": o nome da tabela cresce por cima
 * dela, as linhas de coluna esmaecem, as ligacoes ficam finas e as notas apagam. A
 * caixa nao muda de tamanho (so o que esta dentro dela), entao nada pula.
 */
const FAR_ZOOM = 0.45

/** "Mudanças" recolhe o que nao mudou; "Tudo" mostra cada tabela inteira. */
export type ModelView = 'changes' | 'all'

/**
 * As notas no desenho: resumidas (as presas a uma tabela viram o marcador no
 * cabecalho dela, e o texto e lido no painel), em caixas inteiras como no arquivo, ou
 * escondidas.
 */
export type NotesMode = 'markers' | 'boxes' | 'hidden'

/** Pedido de "leve ate": muda o `seq` a cada clique, mesmo para o mesmo elemento. */
export type FocusRequest = { kind: 'entity' | 'note'; uid: string; seq: number } | null

/** Uma parada do percurso pelas mudancas: as novas primeiro, depois as alteradas. */
export type WalkStop = { uid: string; name: string; kind: 'new' | 'changed' }

/** O que o cartao de espiar mostra, e de qual tabela. */
export type Peek = { uid: string; content: ReactNode } | null

/**
 * O que fica por cima do desenho e precisa do React Flow: o zoom, o enquadramento,
 * o "mostrar no desenho", o percurso pelas mudancas, o botao "Aproximar" e o cartao de espiar.
 * Componente proprio porque so os filhos de <ReactFlow> alcancam o `useReactFlow`.
 *
 * **O desenho so se mexe quando a pessoa mexe.** Clicar escolhe e acende; para chegar
 * perto, ela usa a roda, o + (que aproxima mantendo a tabela escolhida no lugar) ou o
 * "Aproximar" sobre a tabela. A busca, a lista e o percurso deslizam ate a tabela no zoom
 * em que a pessoa estava, nunca aproximam sozinhos.
 */
function CanvasChrome({
  stops, framingReady, focusRequest, selectedUid, peek, onSelect,
}: {
  stops: WalkStop[]
  framingReady: boolean
  focusRequest: FocusRequest
  /** A tabela escolhida: o "Aproximar" aparece sobre ela, e o + aproxima ancorado nela. */
  selectedUid: string
  peek: Peek
  onSelect: (selection: Selection) => void
}) {
  const { fitView, getNode, setCenter, getZoom } = useReactFlow()
  const viewport = useViewport()
  const framed = useRef(false)
  /** Em que parada do percurso a tela esta; `null` com ele desligado. */
  const [walk, setWalk] = useState<number | null>(null)

  /** O meio de uma tabela no desenho: o comeco dela, se for comprida. */
  const middleOf = useCallback((id: string): { x: number; y: number } | null => {
    const node = getNode(id)
    if (!node) return null
    const width = node.measured?.width ?? 240
    const height = node.measured?.height ?? 300
    return { x: node.position.x + width / 2, y: node.position.y + Math.min(height / 2, 260) }
  }, [getNode])

  /** Desliza ate a tabela no zoom de agora. */
  const slideTo = useCallback((id: string): void => {
    const middle = middleOf(id)
    if (middle) void setCenter(middle.x, middle.y, { zoom: getZoom(), duration: 420 })
  }, [middleOf, setCenter, getZoom])

  /** O "Aproximar": chega ao tamanho de leitura. So por pedido da pessoa. */
  const approach = useCallback((uid: string): void => {
    const middle = middleOf(nodeId.entity(uid))
    if (middle) void setCenter(middle.x, middle.y, { zoom: Math.max(getZoom(), 0.95), duration: 480 })
  }, [middleOf, setCenter, getZoom])

  // Abre com o desenho inteiro, assentando num movimento curto. Espera a comparacao
  // chegar e as caixas sem mudanca recolherem, senao enquadraria o tamanho de antes.
  useEffect(() => {
    if (!framingReady || framed.current) return
    framed.current = true
    const timer = setTimeout(() => void fitView({ padding: 0.12, maxZoom: 1, duration: 260 }), 120)
    return () => clearTimeout(timer)
  }, [framingReady, fitView])

  useEffect(() => {
    if (!focusRequest) return
    const id = focusRequest.kind === 'entity' ? nodeId.entity(focusRequest.uid) : nodeId.note(focusRequest.uid)
    const timer = setTimeout(() => slideTo(id), 40)
    return () => clearTimeout(timer)
  }, [focusRequest?.seq])

  /** Vai a uma parada do percurso: escolhe a tabela (o painel mostra o que mudou nela) e desliza ate ela. */
  const goTo = useCallback((index: number): void => {
    if (stops.length === 0) return
    const wrapped = (index + stops.length) % stops.length
    const stop = stops[wrapped]
    if (!stop) return
    setWalk(wrapped)
    onSelect({ type: 'entity', uid: stop.uid })
    slideTo(nodeId.entity(stop.uid))
  }, [stops, onSelect, slideTo])

  // No percurso: ← e → andam, Esc sai. Fora de campo de texto, para nao roubar a tecla de quem digita.
  useEffect(() => {
    if (walk === null) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable]')) return
      if (event.key === 'ArrowRight') { event.preventDefault(); goTo(walk + 1) }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(walk - 1) }
      else if (event.key === 'Escape') { event.preventDefault(); setWalk(null) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [walk, goTo])

  /** Onde uma tabela esta na tela, a partir do desenho e do zoom de agora. */
  const onScreen = (uid: string): { left: number; top: number; width: number; height: number } | null => {
    const node = getNode(nodeId.entity(uid))
    if (!node) return null
    return {
      left: node.position.x * viewport.zoom + viewport.x,
      top: node.position.y * viewport.zoom + viewport.y,
      width: (node.measured?.width ?? 240) * viewport.zoom,
      height: (node.measured?.height ?? 120) * viewport.zoom,
    }
  }

  const stop = walk === null ? undefined : stops[walk]
  // O "Aproximar" so faz sentido enquanto a tabela ainda esta pequena para ler.
  const chosen = selectedUid && viewport.zoom < 0.8 ? onScreen(selectedUid) : null
  // Espiar so de longe: perto, a propria tabela ja se le.
  const peekBox = peek && viewport.zoom < 0.7 ? onScreen(peek.uid) : null

  return (
    <>
      <ZoomBar
        walk={stops.length > 0 && walk === null ? { count: stops.length, onStart: () => goTo(0) } : undefined}
        anchor={selectedUid ? () => middleOf(nodeId.entity(selectedUid)) : undefined}
      />
      {chosen && (
        <button
          className="approach"
          style={{ left: chosen.left + chosen.width / 2, top: chosen.top - 10 }}
          title="aproximar até ler a tabela"
          onClick={() => approach(selectedUid)}
        >
          <Icon name="plus" size={13} />
          <span>Aproximar</span>
        </button>
      )}
      {peek && peekBox && (
        <div className="peek" style={{ left: peekBox.left + peekBox.width + 12, top: Math.max(8, peekBox.top) }} role="tooltip">
          {peek.content}
        </div>
      )}
      {stop && walk !== null && (
        <div className="walk" role="toolbar" aria-label="percorrer as mudanças">
          <span className="walk__count">Mudança {walk + 1} de {stops.length}</span>
          <span className="walk__name"><code>{stop.name}</code><span className={`tag tag--${stop.kind}`}>{stop.kind === 'new' ? 'nova' : 'alterada'}</span></span>
          <button className="btn btn--small" title="anterior (←)" onClick={() => goTo(walk - 1)}>
            <Icon name="chevronLeft" size={14} /><span>Anterior</span>
          </button>
          <button className="btn btn--small btn--primary" title="próxima (→)" onClick={() => goTo(walk + 1)}>
            <span>Próxima</span><Icon name="chevronRight" size={14} />
          </button>
          <button className="btn btn--small btn--ghost" title="parar de percorrer (Esc)" onClick={() => setWalk(null)}>
            Sair
          </button>
        </div>
      )}
    </>
  )
}

type BoardProps = {
  doc: ModelDoc
  /** A comparacao com o arquivo-base; nula quando nao ha base. */
  changes: ChangeSet | null
  /** A comparacao ja chegou (ou nao vai existir): e quando o enquadramento inicial roda. */
  framingReady: boolean
  view: ModelView
  notesMode: NotesMode
  /** "Leitura": nada se arrasta, se liga ou se edita no canvas. */
  locked: boolean
  selection: Selection
  onSelect: (selection: Selection) => void
  actions: ModelActions
  focusRequest: FocusRequest
  onShowEntityNotes: (entityUid: string) => void
  /** O clique numa coluna mostra ela no painel. */
  onEditField: (entityUid: string, fieldUid: string) => void
  /** O "Editar" do aviso de leitura: libera a edicao. */
  onRequestEdit: () => void
  onViewportChange: (viewport: Viewport) => void
}

export default function Board({
  doc, changes, framingReady, view, notesMode, locked, selection, onSelect, actions,
  focusRequest, onShowEntityNotes, onEditField, onRequestEdit, onViewportChange,
}: BoardProps) {
  // O zoom em degraus de 5%: decide se o desenho e lido de longe (ver `FAR_ZOOM`) e o
  // tamanho do nome no cartao. Em degraus para nao refazer as caixas a cada quadro.
  const [zoom, setZoom] = useState(1)
  const far = zoom < FAR_ZOOM
  // A tabela sob o mouse: acende as ligacoes dela e, de longe, abre o cartao de espiar.
  const [hovered, setHovered] = useState('')

  // O que esta aberto para edicao no proprio desenho. Mora aqui, e nao no documento,
  // porque e estado de tela, nao vai para o arquivo nem suja o autosave.
  const [inline, setInline] = useState<InlineEditing>(null)
  // O aviso que aparece quando alguem tenta editar em leitura.
  const [lockHint, setLockHint] = useState(0)

  // Voltar a "Leitura" fecha o que estava aberto.
  useEffect(() => { if (locked) setInline(null) }, [locked])

  useEffect(() => {
    if (!lockHint) return
    const timer = setTimeout(() => setLockHint(0), 4500)
    return () => clearTimeout(timer)
  }, [lockHint])
  /**
   * O tamanho que o React Flow mediu de cada no, devolvido a ele em cada no.
   *
   * Os nos sao refeitos a partir do documento a cada mudanca: a cada quadro de um
   * arrasto. O React Flow so guarda a medida que vem no proprio objeto do no; sem
   * devolve-la, todo no volta a "nao medido" a cada quadro, as linhas piscam e o
   * arrasto reclama de no nao inicializado.
   */
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({})

  const editingContext = useMemo(() => ({
    actions,
    locked,
    inline,
    startInline: (target: Exclude<InlineEditing, null>) => setInline(target),
    stopInline: () => setInline(null),
    lockedAttempt: () => setLockHint(Date.now()),
    showEntityNotes: onShowEntityNotes,
    editField: onEditField,
  }), [actions, locked, inline, onShowEntityNotes, onEditField])

  const byName = useMemo(
    () => new Map(doc.entities.map((entity) => [entity.name, entity])),
    [doc.entities],
  )

  const comparing = Boolean(changes)
  const changeOf = useCallback(
    (entity: Entity) => changes?.entities.get(entity.name) ?? null,
    [changes],
  )
  const isCollapsed = useCallback(
    (entity: Entity): boolean => view === 'changes' && changeOf(entity)?.kind === 'same',
    [view, changeOf],
  )
  const isFresh = useCallback(
    (note: Note): boolean => Boolean(changes?.newNotes.has(noteKey(note))),
    [changes],
  )

  /** A tabela escolhida: acende as ligacoes e as notas dela, e apaga as outras. */
  const selectedEntity = selection?.type === 'entity'
    ? doc.entities.find((entity) => entity.uid === selection.uid)?.name ?? ''
    : ''

  /**
   * As notas que vao para o desenho. Na vista "Mudanças" com base, so as novas; nos
   * marcadores, a nota presa a uma tabela existente nao vira caixa: ela e contada
   * no cabecalho da tabela e lida no painel.
   */
  const visibleNotes = useMemo<Note[]>(() => {
    if (notesMode === 'hidden') return []
    const pool = view === 'changes' && comparing ? doc.notes.filter(isFresh) : doc.notes
    return notesMode === 'markers' ? pool.filter((note) => !byName.has(note.anchor)) : pool
  }, [doc.notes, notesMode, view, comparing, isFresh, byName])

  /** As notas de cada tabela, para o marcador do cabecalho: todas, e as novas. */
  const notesByEntity = useMemo(() => {
    const counts = new Map<string, { total: number; fresh: number }>()
    if (notesMode !== 'markers') return counts
    for (const note of doc.notes) {
      if (!byName.has(note.anchor)) continue
      const count = counts.get(note.anchor) ?? { total: 0, fresh: 0 }
      count.total += 1
      if (isFresh(note)) count.fresh += 1
      counts.set(note.anchor, count)
    }
    return counts
  }, [doc.notes, notesMode, byName, isFresh])

  const nodes = useMemo<AppNode[]>(() => {
    const entities: AppNode[] = doc.entities.map((entity) => ({
      id: nodeId.entity(entity.uid),
      type: 'entity',
      position: entity.position,
      data: {
        entity,
        // Com uma tabela escolhida na vista "Mudanças", as recolhidas nao competem.
        dim: Boolean(selectedEntity) && isCollapsed(entity) && entity.name !== selectedEntity,
        change: changeOf(entity),
        collapsed: isCollapsed(entity),
        notes: notesByEntity.get(entity.name) ?? { total: 0, fresh: 0 },
        far,
        zoom,
      },
      measured: measured[nodeId.entity(entity.uid)],
      selected: selection?.type === 'entity' && selection.uid === entity.uid,
    }))

    const notes: AppNode[] = visibleNotes.map((note) => ({
      id: nodeId.note(note.uid),
      type: 'note',
      position: note.position,
      data: {
        note,
        dim: Boolean(selectedEntity) && note.anchor !== selectedEntity,
        compact: notesMode === 'markers',
        fresh: comparing && isFresh(note),
        // De longe a nota apaga em vez de sumir: nada salta quando o zoom cruza o limite.
        far: far && !(selection?.type === 'note' && selection.uid === note.uid),
      },
      measured: measured[nodeId.note(note.uid)],
      selected: selection?.type === 'note' && selection.uid === note.uid,
      // A nota resumida e para ler, nao para arrumar: arrastar mudaria a posicao gravada.
      draggable: !locked && notesMode === 'boxes',
    }))

    return [...entities, ...notes]
  }, [doc.entities, visibleNotes, notesByEntity, selectedEntity, isCollapsed, changeOf, comparing, isFresh, notesMode, locked, selection, measured, far, zoom])

  const edges = useMemo<Edge[]>(() => {
    /** O ponto exato onde a linha gruda: a altura do campo, ou a borda da caixa. */
    const attach = (entity: Entity, fieldName: string, side: Side): string => {
      // A caixa recolhida nao tem as linhas dos campos: a ligacao vai na borda.
      const field = fieldName && !isCollapsed(entity) ? entity.fields.find((f) => f.name === fieldName) : undefined
      return field ? handleId.field(field.uid, side) : handleId.box(side)
    }

    const relations: Edge[] = doc.relations.flatMap((relation) => {
      const from = byName.get(relation.from)
      const to = byName.get(relation.to)
      // Relacao orfa aparece como aviso no painel, nao como linha solta no canvas.
      if (!from || !to) return []

      // Ponto preso a uma linha da tabela so tem lateral: ver `pickSides`.
      const onField = Boolean((relation.fromField && !isCollapsed(from)) || (relation.toField && !isCollapsed(to)))
      const sides = pickSides(boxCenter(from), boxCenter(to), onField)
      const isSelected = selection?.type === 'relation' && selection.uid === relation.uid
      const isNew = Boolean(changes?.newRelations.has(relationKey(relation)))
      const touches = Boolean(selectedEntity) && (relation.from === selectedEntity || relation.to === selectedEntity)
      // Passar o mouse numa tabela ja mostra com quem ela se liga, sem precisar clicar.
      const hoverName = hovered ? doc.entities.find((entity) => entity.uid === hovered)?.name : ''
      const hoveredTouch = Boolean(hoverName) && (relation.from === hoverName || relation.to === hoverName)

      // Com uma tabela escolhida, so as ligacoes dela ficam acesas; na vista
      // "Mudanças", a ligacao entre duas tabelas sem mudanca fica ao fundo.
      const faded = (Boolean(selectedEntity) && !touches && !isSelected)
        || (!selectedEntity && view === 'changes' && comparing && !isNew && isCollapsed(from) && isCollapsed(to))

      return [{
        id: edgeId.relation(relation.uid),
        className: [isNew ? 'is-new' : '', faded && !hoveredTouch ? 'is-faded' : '', touches ? 'is-related' : '', hoveredTouch && !touches ? 'is-hover' : '', far ? 'is-far' : ''].filter(Boolean).join(' ') || undefined,
        source: nodeId.entity(from.uid),
        target: nodeId.entity(to.uid),
        sourceHandle: attach(from, relation.fromField, sides.source),
        targetHandle: attach(to, relation.toField, sides.target),
        type: 'smoothstep',
        // O "1:N" so onde ajuda a ler: na ligacao escolhida, nas da tabela escolhida e
        // nas novas. Em todas, cobria o desenho de rotulos.
        label: isSelected || touches || (isNew && !far) ? relationLabel(relation.kind) : undefined,
        selected: isSelected,
        zIndex: isSelected || touches ? 2 : 0,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        style: { strokeWidth: isSelected || touches ? 2.4 : far ? 1 : isNew ? 2 : 1.4 },
      }]
    })

    // A seta da nota so existe com a nota em caixa: no marcador, a ligacao e o
    // proprio cabecalho da tabela.
    const anchors: Edge[] = notesMode !== 'boxes' ? [] : visibleNotes.flatMap((note) => {
      if (!note.anchor) return []
      const target = byName.get(note.anchor)
      if (!target) return []

      const onField = Boolean(note.anchorField) && !isCollapsed(target)
      const sides = pickSides(boxCenter(note as Note), boxCenter(target), onField)
      const isSelected = selection?.type === 'note' && selection.uid === note.uid
      const dim = Boolean(selectedEntity) && note.anchor !== selectedEntity

      return [{
        id: edgeId.anchor(note.uid),
        source: nodeId.note(note.uid),
        target: nodeId.entity(target.uid),
        sourceHandle: handleId.box(sides.source),
        targetHandle: attach(target, note.anchorField, sides.target),
        type: 'smoothstep',
        className: `edge-anchor${dim ? ' is-faded' : ''}`,
        selected: isSelected,
        markerEnd: { type: MarkerType.Arrow, width: 16, height: 16 },
        style: { strokeDasharray: '5 4', strokeWidth: isSelected ? 2 : 1.2 },
      }]
    })

    return [...relations, ...anchors]
  }, [doc.relations, doc.entities, visibleNotes, notesMode, byName, changes, comparing, view, isCollapsed, selectedEntity, selection, hovered, far])

  /** O cartao de espiar da tabela sob o mouse: o que ela e e o que mudou nela. */
  const peek = useMemo<Peek>(() => {
    const entity = hovered ? doc.entities.find((item) => item.uid === hovered) : undefined
    if (!entity) return null
    const change = changeOf(entity)
    const kind = change && change.kind !== 'same' ? change.kind : null
    const fields = change && change.kind !== 'new' ? [...change.fields.values()].filter((field) => field.kind !== 'text') : []
    const notes = doc.notes.filter((note) => note.anchor === entity.name).length
    return {
      uid: entity.uid,
      content: (
        <>
          <div className="peek__head">
            <code>{entity.name}</code>
            {kind && <span className={`tag tag--${kind}`}>{kind === 'new' ? 'nova' : kind === 'changed' ? 'alterada' : 'só texto'}</span>}
          </div>
          {entity.label && <p className="peek__label">{entity.label}</p>}
          {fields.length > 0 && (
            <ul className="peek__list">
              {fields.slice(0, 5).map((field) => (
                <li key={field.name}><span className={`mark mark--${field.kind}`}>{field.kind === 'new' ? '+' : '~'}</span><code>{field.name}</code></li>
              ))}
              {change?.removedFields.slice(0, 3).map((field) => (
                <li key={`r-${field.name}`}><span className="mark mark--removed">−</span><code>{field.name}</code></li>
              ))}
              {fields.length > 5 && <li className="peek__more">e mais {fields.length - 5}</li>}
            </ul>
          )}
          <p className="peek__foot">{entity.fields.length} colunas{notes > 0 ? `, ${notes} nota(s)` : ''}, clique para escolher</p>
        </>
      ),
    }
  }, [hovered, doc.entities, doc.notes, changeOf])

  /** As paradas do percurso: as tabelas novas primeiro, depois as alteradas. */
  const stops = useMemo<WalkStop[]>(() => {
    if (!changes) return []
    const of = (kind: 'new' | 'changed'): WalkStop[] => doc.entities
      .filter((entity) => changes.entities.get(entity.name)?.kind === kind)
      .map((entity) => ({ uid: entity.uid, name: entity.name, kind }))
    return [...of('new'), ...of('changed')]
  }, [doc.entities, changes])

  // O React Flow avisa a cada quadro do arrasto; gravamos a posicao no documento na
  // hora e o autosave cuida do resto depois que a mao solta. Em "Leitura" nada se
  // arrasta, e so as medidas chegam aqui.
  const onNodesChange = useCallback((changesOfNodes: NodeChange<AppNode>[]) => {
    const sizes = changesOfNodes.flatMap((change) =>
      change.type === 'dimensions' && change.dimensions ? [{ id: change.id, ...change.dimensions }] : [])
    if (sizes.length > 0) {
      setMeasured((previous) => {
        const same = sizes.every(({ id, width, height }) =>
          previous[id]?.width === width && previous[id]?.height === height)
        if (same) return previous
        const next = { ...previous }
        for (const { id, width, height } of sizes) next[id] = { width, height }
        return next
      })
    }

    if (locked) return
    for (const change of changesOfNodes) {
      if (change.type !== 'position' || !change.position) continue
      const { kind, uid } = parseNodeId(change.id)
      if (kind === 'entity') actions.moveEntity(uid, change.position)
      else if (kind === 'note') actions.updateNote(uid, { position: change.position })
    }
  }, [actions, locked])

  /**
   * Entidade + entidade vira relação; nota + entidade vira a seta da nota.
   * Se a ponta foi puxada de uma linha da tabela, o campo vai junto.
   */
  const onConnect = useCallback((connection: Connection) => {
    if (locked) return
    const source = parseNodeId(connection.source ?? '')
    const target = parseNodeId(connection.target ?? '')

    const entityByUid = (uid: string): Entity | undefined =>
      doc.entities.find((e) => e.uid === uid)

    /** Nome do campo de onde a ponta saiu; vazio quando saiu da borda da caixa. */
    const fieldNameOf = (entityUid: string, handle: string | null | undefined): string => {
      const parsed = parseHandleId(handle)
      if (parsed.kind !== 'field') return ''
      return entityByUid(entityUid)?.fields.find((f) => f.uid === parsed.fieldUid)?.name ?? ''
    }

    if (source.kind === 'entity' && target.kind === 'entity') {
      const from = entityByUid(source.uid)
      const to = entityByUid(target.uid)
      if (!from || !to) return
      actions.addRelation(
        from.name,
        to.name,
        fieldNameOf(source.uid, connection.sourceHandle),
        fieldNameOf(target.uid, connection.targetHandle),
      )
      return
    }

    // A ligacao pode ter sido puxada nos dois sentidos; o resultado e o mesmo.
    const isSourceNote = source.kind === 'note'
    const note = isSourceNote ? source : target.kind === 'note' ? target : null
    const entitySide = isSourceNote ? target : source
    const entityHandle = isSourceNote ? connection.targetHandle : connection.sourceHandle

    if (note && entitySide.kind === 'entity') {
      const entity = entityByUid(entitySide.uid)
      if (!entity) return
      actions.updateNote(note.uid, {
        anchor: entity.name,
        anchorField: fieldNameOf(entitySide.uid, entityHandle),
      })
      onSelect({ type: 'note', uid: note.uid })
    }
  }, [doc.entities, actions, onSelect, locked])

  return (
    <CanvasEditingProvider value={editingContext}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => {
          const { kind, uid } = parseNodeId(node.id)
          if (!kind) return
          // Escolher outro elemento fecha o que estava aberto no anterior.
          setInline((current) => (current && (current.kind === 'note' ? current.uid : current.entityUid) !== uid ? null : current))
          onSelect({ type: kind, uid })
        }}
        onEdgeClick={(_, edge) => {
          const { kind, uid } = parseEdgeId(edge.id)
          // Clicar na seta seleciona a nota dona dela: a seta não é entidade própria.
          if (kind === 'relation') onSelect({ type: 'relation', uid })
          else if (kind === 'anchor') onSelect({ type: 'note', uid })
        }}
        onPaneClick={() => { onSelect(null); setInline(null) }}
        onNodeMouseEnter={(_, node) => {
          const { kind, uid } = parseNodeId(node.id)
          if (kind === 'entity') setHovered(uid)
        }}
        onNodeMouseLeave={() => setHovered('')}
        className={far ? 'is-far' : undefined}
        onMove={(_, viewport) => {
          onViewportChange(viewport)
          const step = Math.round(viewport.zoom * 20) / 20
          setZoom((current) => (current === step ? current : step))
        }}
        connectionMode={ConnectionMode.Loose}
        nodesDraggable={!locked}
        nodesConnectable={!locked}
        // Apagar é sempre pelo painel ou pela caixa: a tecla Delete removeria o nó
        // sem passar pelo documento.
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
        minZoom={0.15}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
      >
        <CanvasChrome
          stops={stops}
          framingReady={framingReady}
          focusRequest={focusRequest}
          selectedUid={selection?.type === 'entity' ? selection.uid : ''}
          peek={peek}
          onSelect={onSelect}
        />
        <Background gap={20} size={1} />
        {/* O tamanho vai pelo `style`: é dele que o minimapa tira o tamanho do desenho.
            Só no CSS, a caixa encolhe e o desenho de dentro vaza. */}
        {/* De longe o desenho inteiro ja esta na tela: o minimapa apaga (ver `.react-flow.is-far`). */}
        {<MiniMap
          style={{ width: 150, height: 100 }}
          pannable
          zoomable
          nodeColor={(node) => {
            if (node.type !== 'entity') return 'rgba(240, 180, 41, 0.5)'
            const kind = changes?.entities.get((node.data as { entity: Entity }).entity.name)?.kind
            return kind === 'new' ? '#4cc38a' : kind === 'changed' ? '#f0b429' : '#3d4757'
          }}
        />}
      </ReactFlow>
      {lockHint > 0 && (
        <div className="lock-hint" role="status">
          <Icon name="lock" size={14} />
          <span>Em leitura: nada se edita nem se arrasta.</span>
          <button className="btn btn--small btn--primary" onClick={() => { setLockHint(0); onRequestEdit() }}>
            <Icon name="pencil" size={14} />
            <span>Editar</span>
          </button>
        </div>
      )}
      {changes && (
        <div className="legend" aria-hidden="true">
          <span className="legend__item"><span className="legend__swatch legend__swatch--new" />nova</span>
          <span className="legend__item"><span className="legend__swatch legend__swatch--changed" />alterada</span>
          <span className="legend__item"><span className="legend__swatch legend__swatch--text" />só texto</span>
          <span className="legend__item"><span className="legend__swatch legend__swatch--same" />sem mudança</span>
        </div>
      )}
    </CanvasEditingProvider>
  )
}
