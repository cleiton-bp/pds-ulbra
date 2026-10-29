import { useEffect, useRef, useState } from 'react'
import Icon from '../../../shared/Icon'
import type { Changes } from '../../hooks/useChanges'
import type { ModelActions } from '../../hooks/useModelActions'
import { relationLabel } from '../../model/constants'
import { noteKey, type EntityChange } from '../../model/diff'
import type { Entity, Field, ModelDoc, Note, Selection } from '../../types'
import ChangesPanel, { FieldList } from './ChangesPanel'
import EntityInspector from './EntityInspector'
import NoteInspector from './NoteInspector'
import RelationInspector from './RelationInspector'

type InspectorProps = {
  doc: ModelDoc
  selection: Selection
  actions: ModelActions
  changes: Changes
  locked: boolean
  onSelect: (selection: Selection) => void
  /** Escolhe e leva o desenho ate a tabela ou a nota. */
  onGo: (kind: 'entity' | 'note', uid: string) => void
  /** Muda a cada clique no marcador de notas de uma tabela: o painel rola ate elas. */
  notesFocus: number
  /** A coluna que o desenho mandou abrir no editor da tabela. */
  fieldFocus: { uid: string; seq: number } | null
}

const KIND_TAG = { new: 'nova', changed: 'alterada', text: 'só texto' } as const

/** O aviso no lugar do editor, em "Leitura": diz onde liberar. */
function LockedHint() {
  return (
    <p className="panel__locked">
      <Icon name="lock" size={14} />
      <span>Em leitura: para editar, clique em <strong>Leitura</strong> na barra de cima (Alt+E).</span>
    </p>
  )
}

function BackToChanges({ onSelect }: { onSelect: (selection: Selection) => void }) {
  return (
    <button className="panel__back" onClick={() => onSelect(null)}>
      <Icon name="chevronLeft" size={14} />
      <span>Mudanças do arquivo</span>
    </button>
  )
}

/** As colunas da tabela para ler, com o que mudou marcado: o editor fica para quem edita. */
function ColumnsRead({ entity, change, focus }: { entity: Entity; change: EntityChange | null; focus: { uid: string; seq: number } | null }) {
  // A coluna clicada no desenho: destacada aqui, aberta, e rolada ate a vista.
  const focused = useRef<HTMLLIElement>(null)
  const [openUid, setOpenUid] = useState('')
  useEffect(() => {
    if (!focus) return
    setOpenUid(focus.uid)
    setOnlyChanged(false)
    requestAnimationFrame(() => focused.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
  }, [focus?.seq])

  const changeOf = (field: Field) => (change && change.kind !== 'new' ? change.fields.get(field.name) : undefined)
  const changedCount = entity.fields.filter((field) => changeOf(field)).length + (change?.removedFields.length ?? 0)
  // Numa tabela alterada, abre so com o que mudou: e o que se veio ver. As outras
  // colunas ficam a um clique.
  const [onlyChanged, setOnlyChanged] = useState(changedCount > 0)
  const shown = onlyChanged ? entity.fields.filter((field) => changeOf(field)) : entity.fields

  const flags = (field: Field): string[] =>
    [field.pk ? 'PK' : '', field.fk ? 'FK' : '', field.required ? 'obrig' : '', field.unique ? 'único' : ''].filter(Boolean)

  return (
    <>
      <div className="panel__section">
        <h3>Colunas</h3>
        {changedCount > 0 ? (
          <div className="segmented segmented--small" role="radiogroup" aria-label="quais colunas">
            <button role="radio" aria-checked={onlyChanged} className={`segmented__opt${onlyChanged ? ' is-on' : ''}`} onClick={() => setOnlyChanged(true)}>
              Que mudaram ({changedCount})
            </button>
            <button role="radio" aria-checked={!onlyChanged} className={`segmented__opt${!onlyChanged ? ' is-on' : ''}`} onClick={() => setOnlyChanged(false)}>
              Todas ({entity.fields.length})
            </button>
          </div>
        ) : (
          <span className="panel__count">{entity.fields.length}</span>
        )}
      </div>
      <ul className="columns">
        {shown.map((field) => {
          const fieldChange = changeOf(field)
          const open = openUid === field.uid
          return (
            <li
              key={field.uid}
              ref={focus?.uid === field.uid ? focused : undefined}
              className={[fieldChange ? `is-${fieldChange.kind}` : '', focus?.uid === field.uid ? 'is-focus' : '', open ? 'is-open' : ''].filter(Boolean).join(' ')}
            >
              {/* A linha e um botao: a observacao da coluna aparece so ao abrir: com
                  todas a vista, a lista virava um paredao de texto. */}
              <button className="columns__row" aria-expanded={open} disabled={!field.note && fieldChange?.kind !== 'changed'} onClick={() => setOpenUid(open ? '' : field.uid)}>
                <span className={fieldChange ? `mark mark--${fieldChange.kind}` : 'mark'}>
                  {fieldChange?.kind === 'new' ? '+' : fieldChange?.kind === 'changed' ? '~' : fieldChange?.kind === 'text' ? '✎' : ''}
                </span>
                <span className="columns__name">
                  <code>{field.name}</code>
                  {flags(field).length > 0 && (
                    <span className="columns__flags">
                      {flags(field).map((flag) => <span key={flag} className="tag tag--text">{flag}</span>)}
                    </span>
                  )}
                </span>
                <span className="columns__type">{field.type}</span>
              </button>
              {open && (
                <div className="columns__more">
                  {fieldChange?.kind === 'changed' && <p className="columns__change">mudou: {fieldChange.details.join(', ')}</p>}
                  {field.note && <p className="columns__note">{field.note}</p>}
                </div>
              )}
            </li>
          )
        })}
        {change?.removedFields.map((field) => (
          <li key={`removido-${field.name}`} className="is-removed">
            <div className="columns__row">
              <span className="mark mark--removed">−</span>
              <span className="columns__name"><code>{field.name}</code></span>
              <span className="columns__type">removida</span>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

/** A descricao da tabela, curta ate pedir: as quatro primeiras linhas e "ler mais". */
function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 260
  return (
    <div className="description">
      <p className={`panel__text${long && !open ? ' is-clamped' : ''}`}>{text}</p>
      {long && (
        <button className="link description__more" onClick={() => setOpen((value) => !value)}>
          {open ? 'ler menos' : 'ler mais'}
        </button>
      )}
    </div>
  )
}

/** As notas presas a uma tabela, para ler inteiras: no desenho elas sao so o marcador. */
function EntityNotes({ notes, fresh, onSelect, focus }: { notes: Note[]; fresh: (note: Note) => boolean; onSelect: (selection: Selection) => void; focus: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focus > 0) ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [focus])
  if (notes.length === 0) return null
  return (
    <>
      <div className="panel__section" ref={ref}>
        <h3>Notas desta tabela</h3>
        <span className="panel__count">{notes.length}</span>
      </div>
      {notes.map((note) => (
        <button key={note.uid} className="note-read" onClick={() => onSelect({ type: 'note', uid: note.uid })}>
          <span className="note-read__head">
            <Icon name="note" size={13} />
            <span>{note.anchorField ? `sobre ${note.anchorField}` : 'sobre a tabela'}</span>
            {fresh(note) && <span className="tag tag--new">nova</span>}
          </span>
          <p>{note.text}</p>
        </button>
      ))}
    </>
  )
}

/**
 * O painel da direita, conforme o que esta escolhido no canvas. Sem nada escolhido,
 * as mudancas do arquivo; com uma tabela, o que mudou nela, as colunas e as notas.
 *
 * Em "Leitura" tudo e texto para ler; os campos de edicao so aparecem editando:
 * abrir para entender nao pode mexer no arquivo, que grava sozinho.
 */
export default function Inspector({ doc, selection, actions, changes, locked, onSelect, onGo, notesFocus, fieldFocus }: InspectorProps) {
  const entity = selection?.type === 'entity'
    ? doc.entities.find((e) => e.uid === selection.uid)
    : undefined
  const relation = selection?.type === 'relation'
    ? doc.relations.find((r) => r.uid === selection.uid)
    : undefined
  const note = selection?.type === 'note'
    ? doc.notes.find((n) => n.uid === selection.uid)
    : undefined

  const fresh = (item: Note): boolean => Boolean(changes.changes?.newNotes.has(noteKey(item)))

  if (entity) {
    const change = changes.changes?.entities.get(entity.name) ?? null
    const kind = change && change.kind !== 'same' ? change.kind : null
    const notes = doc.notes.filter((item) => item.anchor === entity.name)
    return (
      <section className="panel" key={`e:${entity.uid}`} aria-label={`tabela ${entity.name}`}>
        <BackToChanges onSelect={onSelect} />
        <header className="panel__head">
          <span className="panel__kind">Tabela</span>
          {kind && <span className={`tag tag--${kind}`}>{KIND_TAG[kind]}</span>}
        </header>
        <h2 className="panel__title"><code>{entity.name}</code></h2>
        {entity.label && <p className="panel__subtitle">{entity.label}</p>}

        {change && change.kind !== 'same' && change.kind !== 'new' && (
          <div className="change-box">
            <h3>O que mudou aqui{changes.base ? ` desde ${changes.base.replace(/\.yaml$/, '')}` : ''}</h3>
            <FieldList change={change} expandable />
          </div>
        )}
        {change?.kind === 'new' && (
          <div className="change-box change-box--new">
            <h3>Tabela nova{changes.base ? `, que ${changes.base.replace(/\.yaml$/, '')} não tinha` : ''}</h3>
          </div>
        )}

        {locked ? (
          <>
            {entity.description && <Description text={entity.description} />}
            <ColumnsRead entity={entity} change={change} focus={fieldFocus} />
            <EntityNotes notes={notes} fresh={fresh} onSelect={onSelect} focus={notesFocus} />
            <LockedHint />
          </>
        ) : (
          <>
            <EntityInspector entity={entity} actions={actions} focusField={fieldFocus} />
            <EntityNotes notes={notes} fresh={fresh} onSelect={onSelect} focus={notesFocus} />
          </>
        )}
      </section>
    )
  }

  if (note) {
    const target = doc.entities.find((item) => item.name === note.anchor)
    return (
      <section className="panel" key={`n:${note.uid}`} aria-label="nota">
        <BackToChanges onSelect={onSelect} />
        <header className="panel__head">
          <span className="panel__kind">Nota</span>
          {fresh(note) && <span className="tag tag--new">nova</span>}
        </header>
        {target && (
          <p className="panel__subtitle">
            sobre{' '}
            <button className="link" onClick={() => onGo('entity', target.uid)}>
              <code>{note.anchor}{note.anchorField ? `.${note.anchorField}` : ''}</code>
            </button>
          </p>
        )}
        {locked ? (
          <>
            <div className="note-read"><p>{note.text || 'nota vazia'}</p></div>
            <LockedHint />
          </>
        ) : (
          // Editando, o texto aparece uma vez so: no campo, inteiro.
          <NoteInspector note={note} entities={doc.entities} actions={actions} />
        )}
      </section>
    )
  }

  if (relation) {
    return (
      <section className="panel" key={`r:${relation.uid}`} aria-label="ligação">
        <BackToChanges onSelect={onSelect} />
        {locked ? (
          <>
            <header className="panel__head"><span className="panel__kind">Ligação</span></header>
            <p className="panel__sentence">
              <code>{relation.from}{relation.fromField ? `.${relation.fromField}` : ''}</code>
              {' '}→{' '}
              <code>{relation.to}{relation.toField ? `.${relation.toField}` : ''}</code>
              {' '}({relationLabel(relation.kind)})
            </p>
            {relation.note && <p className="panel__text">{relation.note}</p>}
            <LockedHint />
          </>
        ) : (
          <RelationInspector relation={relation} entities={doc.entities} actions={actions} />
        )}
      </section>
    )
  }

  return (
    <section className="panel" key="mudancas" aria-label="mudanças do arquivo">
      <ChangesPanel doc={doc} changes={changes} locked={locked} actions={actions} onGo={onGo} />
    </section>
  )
}
