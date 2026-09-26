import type { ModelActions } from '../../hooks/useModelActions'
import type { ModelDoc, Selection } from '../../types'
import DocInspector from './DocInspector'
import EntityInspector from './EntityInspector'
import NoteInspector from './NoteInspector'
import RelationInspector from './RelationInspector'

type InspectorProps = {
  doc: ModelDoc
  selection: Selection
  actions: ModelActions
}

/** Decide qual editor mostrar conforme o que esta selecionado no canvas. */
export default function Inspector({ doc, selection, actions }: InspectorProps) {
  const entity = selection?.type === 'entity'
    ? doc.entities.find((e) => e.uid === selection.uid)
    : undefined
  const relation = selection?.type === 'relation'
    ? doc.relations.find((r) => r.uid === selection.uid)
    : undefined
  const note = selection?.type === 'note'
    ? doc.notes.find((n) => n.uid === selection.uid)
    : undefined

  return (
    <section className="panel">
      {entity ? <EntityInspector entity={entity} actions={actions} />
        : relation ? <RelationInspector relation={relation} entities={doc.entities} actions={actions} />
        : note ? <NoteInspector note={note} entities={doc.entities} actions={actions} />
        : <DocInspector doc={doc} actions={actions} />}
    </section>
  )
}
