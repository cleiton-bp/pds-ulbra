import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
  type NodeChange,
  type Viewport,
} from '@xyflow/react'

import type { ModelActions } from '../../hooks/useModelActions'
import { relationLabel } from '../../model/constants'
import { boxCenter, pickSides } from '../../model/geometry'
import type { Entity, ModelDoc, Note, Selection, Side } from '../../types'
import EntityNode from './EntityNode'
import NoteNode from './NoteNode'
import { CanvasEditingProvider, type Editing } from './EditingContext'
import {
  edgeId, handleId, nodeId, parseEdgeId, parseHandleId, parseNodeId, type AppNode,
} from './nodeTypes'

const NODE_TYPES = { entity: EntityNode, note: NoteNode }

/**
 * Reenquadra a vista sempre que muda o conjunto de notas na tela.
 *
 * Sem isto, esconder notas deixa a modelagem pequena no meio de um canvas vazio,
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

type BoardProps = {
  doc: ModelDoc
  /** Com `false`, as notas e as setas delas somem do canvas — ver `App`. */
  showNotes: boolean
  /** Esconde o que veio da modelagem anterior, deixando só o que esta acrescenta. */
  hideInherited: boolean
  /** Apaga as notas das outras tabelas quando uma tabela é escolhida. */
  focusNotes: boolean
  /** Apaga as tabelas que vieram de antes, deixando as novas em evidência. */
  focusNew: boolean
  selection: Selection
  onSelect: (selection: Selection) => void
  actions: ModelActions
  onViewportChange: (viewport: Viewport) => void
}

export default function Board({
  doc, showNotes, hideInherited, focusNotes, focusNew, selection, onSelect, actions,
  onViewportChange,
}: BoardProps) {
  // Qual linha esta aberta para edicao dentro da caixa. Mora aqui, e nao no documento,
  // porque e estado de tela — nao deve ir para o arquivo nem sujar o autosave.
  const [editing, setEditing] = useState<Editing>(null)

  /**
   * O tamanho que o React Flow mediu de cada no, devolvido a ele em cada no.
   *
   * Os nos sao refeitos a partir do documento a cada mudanca — a cada quadro de um
   * arrasto. O React Flow so guarda a medida que vem no proprio objeto do no; sem
   * devolve-la, todo no volta a "nao medido" a cada quadro, as linhas piscam e o
   * arrasto reclama de no nao inicializado.
   */
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({})

  const editingContext = useMemo(() => ({
    actions,
    editing,
    editField: (entityUid: string, fieldUid: string) =>
      setEditing({ kind: 'field', entityUid, fieldUid }),
    editNote: (uid: string) => setEditing({ kind: 'note', uid }),
    stopEditing: () => setEditing(null),
  }), [actions, editing])

  const byName = useMemo(
    () => new Map(doc.entities.map((entity) => [entity.name, entity])),
    [doc.entities],
  )

  /** O que sobra das notas depois dos filtros da barra. */
  const visibleNotes = useMemo<Note[]>(() => {
    if (!showNotes) return []
    return hideInherited ? doc.notes.filter((note) => !note.inherited) : doc.notes
  }, [doc.notes, showNotes, hideInherited])

  /**
   * A tabela que está mandando no realce. Vazio quando o realce está desligado ou
   * quando o que está escolhido não é uma tabela — e aí ninguém apaga ninguém.
   */
  const focused = useMemo<string>(() => {
    if (!focusNotes || selection?.type !== 'entity') return ''
    return doc.entities.find((entity) => entity.uid === selection.uid)?.name ?? ''
  }, [focusNotes, selection, doc.entities])

  const isDim = useCallback(
    (note: Note): boolean => Boolean(focused) && note.anchor !== focused,
    [focused],
  )

  const nodes = useMemo<AppNode[]>(() => {
    const entities: AppNode[] = doc.entities.map((entity) => ({
      id: nodeId.entity(entity.uid),
      type: 'entity',
      position: entity.position,
      data: { entity, dim: focusNew && entity.inherited },
      measured: measured[nodeId.entity(entity.uid)],
      selected: selection?.type === 'entity' && selection.uid === entity.uid,
    }))

    const notes: AppNode[] = visibleNotes.map((note) => ({
      id: nodeId.note(note.uid),
      type: 'note',
      position: note.position,
      data: { note, dim: isDim(note) },
      measured: measured[nodeId.note(note.uid)],
      selected: selection?.type === 'note' && selection.uid === note.uid,
    }))

    return [...entities, ...notes]
  }, [doc.entities, focusNew, visibleNotes, isDim, selection, measured])

  const edges = useMemo<Edge[]>(() => {
    /** O ponto exato onde a linha gruda: a altura do campo, ou a borda da caixa. */
    const attach = (entity: Entity, fieldName: string, side: Side): string => {
      const field = fieldName ? entity.fields.find((f) => f.name === fieldName) : undefined
      return field ? handleId.field(field.uid, side) : handleId.box(side)
    }

    const relations: Edge[] = doc.relations.flatMap((relation) => {
      const from = byName.get(relation.from)
      const to = byName.get(relation.to)
      // Relacao orfa aparece como aviso no painel, nao como linha solta no canvas.
      if (!from || !to) return []

      // Ponto preso a uma linha da tabela so tem lateral — ver `pickSides`.
      const onField = Boolean(relation.fromField || relation.toField)
      const sides = pickSides(boxCenter(from), boxCenter(to), onField)
      const isSelected = selection?.type === 'relation' && selection.uid === relation.uid

      // Ligação entre duas tabelas apagadas apaga junto; se uma ponta é nova, fica.
      const dimRelation = focusNew && from.inherited && to.inherited

      return [{
        id: edgeId.relation(relation.uid),
        className: dimRelation ? 'is-dim' : undefined,
        source: nodeId.entity(from.uid),
        target: nodeId.entity(to.uid),
        sourceHandle: attach(from, relation.fromField, sides.source),
        targetHandle: attach(to, relation.toField, sides.target),
        type: 'smoothstep',
        label: relationLabel(relation.kind),
        selected: isSelected,
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
        style: { strokeWidth: isSelected ? 2.5 : 1.5 },
      }]
    })

    // A seta da nota: tracejada e mais fina, para nao competir com as relacoes.
    // A seta acompanha a nota: some com ela e apaga com ela.
    const anchors: Edge[] = visibleNotes.flatMap((note) => {
      if (!note.anchor) return []
      const target = byName.get(note.anchor)
      if (!target) return []

      const onField = Boolean(note.anchorField)
      const sides = pickSides(boxCenter(note as Note), boxCenter(target), onField)
      const isSelected = selection?.type === 'note' && selection.uid === note.uid

      return [{
        id: edgeId.anchor(note.uid),
        source: nodeId.note(note.uid),
        target: nodeId.entity(target.uid),
        sourceHandle: handleId.box(sides.source),
        targetHandle: attach(target, note.anchorField, sides.target),
        type: 'smoothstep',
        className: `edge-anchor${isDim(note) ? ' is-dim' : ''}`,
        selected: isSelected,
        markerEnd: { type: MarkerType.Arrow, width: 16, height: 16 },
        style: { strokeDasharray: '5 4', strokeWidth: isSelected ? 2 : 1.2 },
      }]
    })

    return [...relations, ...anchors]
  }, [doc.relations, visibleNotes, byName, focusNew, isDim, selection])

  // O React Flow avisa a cada quadro do arrasto; gravamos a posicao no documento na
  // hora e o autosave cuida do resto depois que a mao solta.
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
      if (kind === 'entity') actions.moveEntity(uid, change.position)
      else if (kind === 'note') actions.updateNote(uid, { position: change.position })
    }
  }, [actions])

  /**
   * Entidade + entidade vira relação; nota + entidade vira a seta da nota.
   * Se a ponta foi puxada de uma linha da tabela, o campo vai junto.
   */
  const onConnect = useCallback((connection: Connection) => {
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
  }, [doc.entities, actions, onSelect])

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
          if (kind) onSelect({ type: kind, uid })
        }}
        onEdgeClick={(_, edge) => {
          const { kind, uid } = parseEdgeId(edge.id)
          // Clicar na seta seleciona a nota dona dela — a seta não é entidade própria.
          if (kind === 'relation') onSelect({ type: 'relation', uid })
          else if (kind === 'anchor') onSelect({ type: 'note', uid })
        }}
        onPaneClick={() => { onSelect(null); setEditing(null) }}
        onMove={(_, viewport) => onViewportChange(viewport)}
        connectionMode={ConnectionMode.Loose}
        // Apagar é sempre pelo painel ou pela caixa: a tecla Delete removeria o nó
        // sem passar pelo documento.
        deleteKeyCode={null}
        fitView
        minZoom={0.2}
        maxZoom={2}
      >
        <RefitOnChange signal={`${showNotes}|${hideInherited}`} />
        <Background gap={18} size={1} />
        <Controls showInteractive={false} />
        {/* O tamanho vai pelo `style`: é dele que o minimapa tira o tamanho do desenho.
            Só no CSS, a caixa encolhe e o desenho de dentro vaza. */}
        <MiniMap style={{ width: 132, height: 92 }} pannable zoomable />
      </ReactFlow>
    </CanvasEditingProvider>
  )
}
