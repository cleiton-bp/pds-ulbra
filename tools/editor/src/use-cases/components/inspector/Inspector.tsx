import type { DiagramActions } from '../../hooks/useDiagramActions'
import type { Selection, UseCaseDoc } from '../../types'
import ActorInspector from './ActorInspector'
import DocInspector from './DocInspector'
import LinkInspector from './LinkInspector'
import NoteInspector from './NoteInspector'
import UseCaseInspector from './UseCaseInspector'

type InspectorProps = {
  doc: UseCaseDoc
  selection: Selection
  actions: DiagramActions
  onSelect: (selection: Selection) => void
}

/** Decide qual editor mostrar conforme o que esta selecionado no canvas. */
export default function Inspector({ doc, selection, actions, onSelect }: InspectorProps) {
  const actor = selection?.type === 'actor' ? doc.actors.find((a) => a.uid === selection.uid) : undefined
  const useCase = selection?.type === 'useCase' ? doc.useCases.find((u) => u.uid === selection.uid) : undefined
  const link = selection?.type === 'link' ? doc.links.find((l) => l.uid === selection.uid) : undefined
  const note = selection?.type === 'note' ? doc.notes.find((n) => n.uid === selection.uid) : undefined

  return (
    // A chave troca o painel inteiro quando muda o que esta escolhido: a rolagem
    // volta para o topo, e nenhum campo aberto de um elemento sobra no outro.
    <section className="panel" key={selection ? `${selection.type}:${selection.uid}` : 'doc'}>
      {actor ? <ActorInspector doc={doc} actor={actor} actions={actions} onSelect={onSelect} />
        : useCase ? <UseCaseInspector doc={doc} useCase={useCase} actions={actions} onSelect={onSelect} />
        : link ? <LinkInspector doc={doc} link={link} actions={actions} />
        : note ? <NoteInspector doc={doc} note={note} actions={actions} />
        : <DocInspector doc={doc} actions={actions} onSelect={onSelect} />}
    </section>
  )
}
