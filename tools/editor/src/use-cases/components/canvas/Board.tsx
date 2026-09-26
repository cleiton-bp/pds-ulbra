import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type FinalConnectionState,
  type NodeChange,
  type Viewport,
} from '@xyflow/react'

import type { DiagramActions } from '../../hooks/useDiagramActions'
import { focusOf } from '../../model/analysis'
import { systemBounds } from '../../model/geometry'
import { addLink } from '../../model/operations'
import { elementType, targetOf } from '../../model/refs'
import type { Selection, UseCaseDoc } from '../../types'
import ActorNode from './ActorNode'
import BoundaryNode from './BoundaryNode'
import DiagramEdge, { EdgeMarkers } from './DiagramEdge'
import { CanvasEditingProvider, type Editing } from './EditingContext'
import NoteNode from './NoteNode'
import UseCaseNode from './UseCaseNode'
import {
  edgeId, handleId, nodeId, parseEdgeId, parseNodeId, type AppNode, type NodeKind, type UmlFlowEdge,
} from './nodeTypes'

const NODE_TYPES = { actor: ActorNode, useCase: UseCaseNode, note: NoteNode, boundary: BoundaryNode }
const EDGE_TYPES = { uml: DiagramEdge }

// A linha desenhada nao sai dos pontos de conexao (ver `DiagramEdge`), mas o React
// Flow so desenha uma aresta cujas pontas existem — estes dois existem em todo no.
const EDGE_HANDLES = { sourceHandle: handleId('right'), targetHandle: handleId('left') }

/**
 * Reenquadra a vista sempre que muda o que esta na tela.
 *
 * Sem isto, esconder as notas deixa o diagrama pequeno no meio de um canvas vazio,
 * que e o contrario da visao limpa que o menu promete. Precisa ser filho de
 * <ReactFlow> para alcancar o `useReactFlow`, e por isso e componente proprio.
 */
function RefitOnChange({ signal }: { signal: string }) {
  const { fitView } = useReactFlow()
  const first = useRef(true)

  useEffect(() => {
    // Na montagem quem enquadra e o `fitView` do proprio <ReactFlow>.
    if (first.current) { first.current = false; return }
    void fitView({ duration: 320, padding: 0.12 })
  }, [signal, fitView])

  return null
}

/** O tamanho medido de cada no, pelo id do no no React Flow. */
export type MeasuredSizes = Record<string, { width: number; height: number }>

type BoardProps = {
  doc: UseCaseDoc
  /** Com `false`, as notas e as setas delas somem do canvas — ver `App`. */
  showNotes: boolean
  /** O retangulo do sistema em volta dos casos de uso. */
  showBoundary: boolean
  /** Apaga o que nao tem a ver com o ator ou caso de uso escolhido. */
  focus: boolean
  selection: Selection
  onSelect: (selection: Selection) => void
  actions: DiagramActions
  /** Onde o canvas deixa as medidas para quem cria elemento novo — ver `useDiagramActions`. */
  sizesRef: MutableRefObject<MeasuredSizes>
  onViewportChange: (viewport: Viewport) => void
}

export default function Board({
  doc, showNotes, showBoundary, focus, selection, onSelect, actions, sizesRef, onViewportChange,
}: BoardProps) {
  // Qual elemento esta com o texto aberto no canvas. Mora aqui, e nao no documento,
  // porque e estado de tela — nao deve ir para o arquivo nem sujar o autosave.
  const [editing, setEditing] = useState<Editing>(null)

  /**
   * O tamanho que o React Flow mediu de cada no, devolvido a ele em cada no.
   *
   * Os nos sao refeitos a partir do documento a cada mudanca — a cada quadro de um
   * arrasto. O React Flow so guarda a medida que vem no proprio objeto do no; sem
   * devolve-la, todo no volta a "nao medido" a cada quadro: a linha, que depende
   * da medida, some e reaparece, e o arrasto reclama de no nao inicializado.
   */
  const [measured, setMeasured] = useState<MeasuredSizes>({})
  sizesRef.current = measured

  const editingContext = useMemo(() => ({
    actions,
    editing,
    edit: (kind: NodeKind, uid: string) => setEditing({ kind, uid }),
    stopEditing: () => setEditing(null),
  }), [actions, editing])

  /** O `id` do no no React Flow para um ator ou caso de uso; vazio se nao existe. */
  const nodeOf = useCallback((uid: string): string => {
    const type = elementType(doc, uid)
    return type === 'actor' ? nodeId.actor(uid) : type === 'useCase' ? nodeId.useCase(uid) : ''
  }, [doc])

  /** O que acende com o realce; `null` quando nada esta apagado. */
  const lit = useMemo(
    () => (focus ? focusOf(doc, selection) : null),
    [focus, doc, selection],
  )
  const isDim = useCallback((uid: string): boolean => Boolean(lit) && !lit?.has(uid), [lit])

  const nodes = useMemo<AppNode[]>(() => {
    const bounds = showBoundary ? systemBounds(doc.useCases) : null
    const boundary: AppNode[] = bounds ? [{
      id: nodeId.boundary,
      type: 'boundary',
      position: { x: bounds.x, y: bounds.y },
      data: { title: doc.meta.system, width: bounds.width, height: bounds.height },
      measured: measured[nodeId.boundary],
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: false,
      // Atras das linhas e dos elementos — ver o comentario do `BoundaryNode`.
      zIndex: -1,
    }] : []

    const actors: AppNode[] = doc.actors.map((actor) => ({
      id: nodeId.actor(actor.uid),
      type: 'actor',
      position: actor.position,
      data: { actor, dim: isDim(actor.uid) },
      measured: measured[nodeId.actor(actor.uid)],
      selected: selection?.type === 'actor' && selection.uid === actor.uid,
    }))

    const useCases: AppNode[] = doc.useCases.map((useCase) => ({
      id: nodeId.useCase(useCase.uid),
      type: 'useCase',
      position: useCase.position,
      data: { useCase, dim: isDim(useCase.uid) },
      measured: measured[nodeId.useCase(useCase.uid)],
      selected: selection?.type === 'useCase' && selection.uid === useCase.uid,
    }))

    // Com o realce ligado, a nota acende junto com o elemento que ela explica.
    const notes: AppNode[] = !showNotes ? [] : doc.notes.map((note) => ({
      id: nodeId.note(note.uid),
      type: 'note',
      position: note.position,
      data: { note, dim: Boolean(lit) && isDim(targetOf(doc, note.anchor)) },
      measured: measured[nodeId.note(note.uid)],
      selected: selection?.type === 'note' && selection.uid === note.uid,
    }))

    return [...boundary, ...actors, ...useCases, ...notes]
  }, [doc, showBoundary, showNotes, selection, lit, isDim, measured])

  const edges = useMemo<UmlFlowEdge[]>(() => {
    const links: UmlFlowEdge[] = doc.links.flatMap((link) => {
      const fromUid = targetOf(doc, link.from)
      const toUid = targetOf(doc, link.to)
      const source = nodeOf(fromUid)
      const target = nodeOf(toUid)
      // Ligacao quebrada aparece como aviso no painel, nao como linha solta no canvas.
      if (!source || !target || source === target) return []
      return [{
        id: edgeId.link(link.uid),
        type: 'uml',
        source,
        target,
        ...EDGE_HANDLES,
        data: { kind: link.kind },
        selected: selection?.type === 'link' && selection.uid === link.uid,
        className: isDim(fromUid) || isDim(toUid) ? 'is-dim' : undefined,
      }]
    })

    // A seta acompanha a nota: some com ela e apaga com ela.
    const anchors: UmlFlowEdge[] = !showNotes ? [] : doc.notes.flatMap((note) => {
      const targetUid = targetOf(doc, note.anchor)
      const target = nodeOf(targetUid)
      if (!target) return []
      return [{
        id: edgeId.anchor(note.uid),
        type: 'uml',
        source: nodeId.note(note.uid),
        target,
        ...EDGE_HANDLES,
        data: { kind: 'anchor' },
        selected: selection?.type === 'note' && selection.uid === note.uid,
        className: lit && isDim(targetUid) ? 'is-dim' : undefined,
      }]
    })

    return [...links, ...anchors]
  }, [doc, showNotes, selection, nodeOf, lit, isDim])

  // O React Flow avisa a cada quadro do arrasto; gravamos a posicao no documento na
  // hora e o autosave cuida do resto depois que a mao solta. A medida de cada no
  // vai para o estado de tela, nunca para o documento.
  const onNodesChange = useCallback((changes: NodeChange<AppNode>[]) => {
    const sizes = changes.flatMap((change) =>
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

    for (const change of changes) {
      if (change.type !== 'position' || !change.position) continue
      const { kind, uid } = parseNodeId(change.id)
      if (kind === 'actor') actions.updateActor(uid, { position: change.position })
      else if (kind === 'useCase') actions.updateUseCase(uid, { position: change.position })
      else if (kind === 'note') actions.updateNote(uid, { position: change.position })
    }
  }, [actions])

  /**
   * Entre dois elementos vira ligacao, com o tipo tirado das pontas; entre uma nota
   * e um elemento vira a seta da nota. Nota com nota nao liga nada.
   */
  const link = useCallback((sourceId: string, targetId: string) => {
    const source = parseNodeId(sourceId)
    const target = parseNodeId(targetId)
    if (!source.kind || !target.kind || source.uid === target.uid) return

    if (source.kind !== 'note' && target.kind !== 'note') {
      // Ligacao que ja existe nao e criada de novo; sem este teste a selecao iria
      // para uma ligacao que nao existe e o arquivo seria regravado igual.
      if (addLink(doc, 'probe', source.uid, target.uid) === doc) return
      actions.connect(source.uid, target.uid)
      return
    }

    // A seta da nota pode ter sido puxada nos dois sentidos; o resultado e o mesmo.
    const [note, other] = source.kind === 'note' ? [source, target] : [target, source]
    if (other.kind !== 'note') actions.anchorNote(note.uid, other.uid)
  }, [actions, doc])

  const onConnect = useCallback((connection: Connection) => {
    link(connection.source ?? '', connection.target ?? '')
  }, [link])

  /**
   * Soltar a linha em qualquer ponto do elemento tambem liga — nao so em cima de um
   * dos pontinhos da borda, que sao pequenos e somem ate o mouse chegar. Quando a
   * linha caiu num ponto de verdade, quem ligou foi o `onConnect`, e aqui nao faz nada.
   */
  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid || !state.fromNode) return
    const point = 'changedTouches' in event ? event.changedTouches[0] : event
    if (!point) return
    const element = document.elementFromPoint(point.clientX, point.clientY)?.closest('.react-flow__node')
    const targetId = element?.getAttribute('data-id')
    if (targetId && targetId !== state.fromNode.id) link(state.fromNode.id, targetId)
  }, [link])

  return (
    <CanvasEditingProvider value={editingContext}>
      <EdgeMarkers />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onNodeClick={(_, node) => {
          const { kind, uid } = parseNodeId(node.id)
          if (!kind) return
          // Escolher outro elemento fecha o texto que estava aberto no anterior. Na
          // forma de funcao, para nao desfazer o `edit` que o proprio clique acabou de
          // pedir — o clique no texto da nota abre a edicao e sobe ate aqui.
          setEditing((current) => (current && current.uid !== uid ? null : current))
          onSelect({ type: kind, uid })
        }}
        onEdgeClick={(_, edge) => {
          const { kind, uid } = parseEdgeId(edge.id)
          // Clicar na seta seleciona a nota dona dela — a seta nao e elemento proprio.
          if (kind === 'link') onSelect({ type: 'link', uid })
          else if (kind === 'anchor') onSelect({ type: 'note', uid })
        }}
        onPaneClick={() => { onSelect(null); setEditing(null) }}
        onMove={(_, viewport) => onViewportChange(viewport)}
        connectionMode={ConnectionMode.Loose}
        // Clique duplo abre o nome para edicao; nao pode tambem dar zoom.
        zoomOnDoubleClick={false}
        // Apagar e sempre pelo painel: a tecla Delete removeria o no sem passar pelo documento.
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.2}
        maxZoom={2}
      >
        <RefitOnChange signal={`${showNotes}|${showBoundary}`} />
        <Background gap={18} size={1} />
        <Controls showInteractive={false} />
        {/* O tamanho vai pelo `style`: e dele que o minimapa tira o tamanho do desenho.
            So no CSS, a caixa encolhe e o desenho de dentro vaza. */}
        <MiniMap
          style={{ width: 132, height: 92 }}
          pannable
          zoomable
          nodeColor={(node) => (node.type === 'boundary' ? 'transparent' : 'var(--line-strong)')}
          nodeStrokeColor={(node) => (node.type === 'boundary' ? 'var(--line-strong)' : 'transparent')}
        />
      </ReactFlow>
    </CanvasEditingProvider>
  )
}
