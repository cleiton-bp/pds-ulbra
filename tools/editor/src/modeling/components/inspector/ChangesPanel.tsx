import { useState } from 'react'
import Icon from '../../../shared/Icon'
import type { Changes } from '../../hooks/useChanges'
import type { ModelActions } from '../../hooks/useModelActions'
import { noteKey, relationKey, type ChangeSet, type EntityChange } from '../../model/diff'
import type { Entity, ModelDoc, Note } from '../../types'
import DocInspector from './DocInspector'

const MARK = { new: '+', changed: '~', text: '✎' } as const

/** A frase do resumo, so com o que existe: "1 tabela nova, 2 alteradas e 3 notas novas." */
function summarize(counts: ChangeSet['counts']): string {
  const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`
  const parts = [
    counts.newEntities > 0 ? plural(counts.newEntities, 'tabela nova', 'tabelas novas') : '',
    counts.changedEntities > 0 ? plural(counts.changedEntities, 'alterada', 'alteradas') : '',
    counts.newFields > 0 ? plural(counts.newFields, 'coluna nova', 'colunas novas') : '',
    counts.changedFields > 0 ? plural(counts.changedFields, 'coluna mudada', 'colunas mudadas') : '',
    counts.removedFields > 0 ? plural(counts.removedFields, 'coluna removida', 'colunas removidas') : '',
    counts.newNotes > 0 ? plural(counts.newNotes, 'nota nova', 'notas novas') : '',
  ].filter(Boolean)
  if (parts.length === 0) return 'Só a explicação de algumas tabelas mudou.'
  return parts.length === 1 ? `${parts[0]}.` : `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}.`
}

/** A primeira linha da nota, para a lista: o texto inteiro abre ao clicar. */
const firstLine = (text: string): string => text.split('\n').find((line) => line.trim()) ?? text

/**
 * As colunas que mudaram. A mudanca de estrutura (+ nova, ~ mudou, − removida) fica a
 * vista; a observacao so reescrita vira uma linha, "e mais N observações reescritas":
 * numa tabela de quarenta colunas ela enterrava o que importa. Com `expandable`, a
 * linha abre a lista; dentro de um botao (a lista de mudancas), ela so conta.
 */
export function FieldList({ change, expandable = false }: { change: EntityChange; expandable?: boolean }) {
  const [showText, setShowText] = useState(false)
  const fields = [...change.fields.values()]
  const structural = fields.filter((field) => field.kind !== 'text')
  const textOnly = fields.filter((field) => field.kind === 'text')
  if (fields.length === 0 && change.removedFields.length === 0) {
    return change.textChanged ? <ul className="change-item__fields"><li><small>a descrição da tabela mudou</small></li></ul> : null
  }
  const row = (field: (typeof fields)[number]) => (
    <li key={field.name}>
      <span className={`mark mark--${field.kind}`}>{MARK[field.kind]}</span>
      <code>{field.name}</code>
      {field.details.length > 0 && <small>{field.details.join(', ')}</small>}
      {field.kind === 'new' && <small>nova</small>}
    </li>
  )
  const reworded = `${textOnly.length} ${textOnly.length === 1 ? 'observação reescrita' : 'observações reescritas'}`
  return (
    <ul className="change-item__fields">
      {structural.map(row)}
      {change.removedFields.map((field) => (
        <li key={`removido-${field.name}`}>
          <span className="mark mark--removed">−</span>
          <code>{field.name}</code>
          <small>removida</small>
        </li>
      ))}
      {textOnly.length > 0 && (expandable ? (
        <>
          <li>
            <button className="link change-item__more" aria-expanded={showText} onClick={() => setShowText((value) => !value)}>
              {showText ? 'esconder' : structural.length > 0 || change.removedFields.length > 0 ? `e mais ${reworded}` : reworded}
            </button>
          </li>
          {showText && textOnly.map(row)}
        </>
      ) : (
        <li><small className="change-item__more">{structural.length > 0 || change.removedFields.length > 0 ? `e mais ${reworded}` : reworded}</small></li>
      ))}
    </ul>
  )
}

type ChangesPanelProps = {
  doc: ModelDoc
  changes: Changes
  locked: boolean
  actions: ModelActions
  /** Escolhe a tabela ou a nota e leva o desenho ate ela. */
  onGo: (kind: 'entity' | 'note', uid: string) => void
}

/**
 * O que aparece no painel quando nada esta escolhido: o que este arquivo muda em
 * relacao ao anterior (tabelas novas, alteradas (coluna por coluna), so de texto,
 * ligacoes e notas novas, e o que saiu). Cada item leva ate ele no desenho.
 *
 * Embaixo, recolhido, o titulo e a descricao do arquivo.
 */
export default function ChangesPanel({ doc, changes: state, locked, actions, onGo }: ChangesPanelProps) {
  const { changes, base, options } = state

  const entityOf = (name: string): Entity | undefined => doc.entities.find((entity) => entity.name === name)
  const listOf = (kind: EntityChange['kind']): EntityChange[] =>
    changes ? [...changes.entities.values()].filter((change) => change.kind === kind) : []

  const freshNotes: Note[] = changes ? doc.notes.filter((note) => changes.newNotes.has(noteKey(note))) : []
  const newRelations = changes ? doc.relations.filter((relation) => changes.newRelations.has(relationKey(relation))) : []

  const groups: Array<{ kind: 'new' | 'changed' | 'text'; title: string; items: EntityChange[] }> = [
    { kind: 'new', title: 'Tabelas novas', items: listOf('new') },
    { kind: 'changed', title: 'Tabelas alteradas', items: listOf('changed') },
    { kind: 'text', title: 'Só o texto mudou', items: listOf('text') },
  ]

  const nothing = changes && groups.every((group) => group.items.length === 0)
    && freshNotes.length === 0 && newRelations.length === 0
    && changes.removedEntities.length === 0 && changes.removedRelations.length === 0

  return (
    <>
      <header className="panel__head">
        <span className="panel__kind">Mudanças deste arquivo</span>
      </header>

      <label className="changes__base">
        <span>Comparado com</span>
        <select value={base ?? ''} onChange={(event) => state.choose(event.target.value)}>
          <option value="">não comparar</option>
          {options.map((name) => (
            <option key={name} value={name}>{name.replace(/\.yaml$/, '')}</option>
          ))}
        </select>
      </label>

      {state.error && <p className="changes__empty">{state.error}</p>}
      {!base && (
        <p className="changes__empty">
          Sem um arquivo anterior na sequência, escolha acima um para comparar, e o desenho
          passa a marcar o que é novo, o que mudou e o que é igual.
        </p>
      )}
      {base && !changes && !state.error && <p className="changes__empty">comparando…</p>}

      {changes && !nothing && (
        // Uma frase, e nao seis etiquetas: o resumo se le de uma vez.
        <p className="changes__sentence">{summarize(changes.counts)}</p>
      )}

      {nothing && <p className="changes__empty">Nenhuma diferença em relação a {base?.replace(/\.yaml$/, '')}.</p>}

      {groups.map((group) => group.items.length > 0 && (
        // O que so mudou de texto abre recolhido: e o menos importante, e o mais longo.
        <details key={group.kind} className="changes__group" open={group.kind !== 'text'}>
          <summary><Icon name="chevronDown" size={14} />{group.title} <span className={`tag tag--${group.kind}`}>{group.items.length}</span></summary>
          <ul className="changes__list">
            {group.items.map((change) => {
              const entity = entityOf(change.name)
              return (
                <li key={change.name}>
                  <button className="change-item" onClick={() => entity && onGo('entity', entity.uid)}>
                    <span className="change-item__head">
                      <span className="change-item__name">{change.name}</span>
                      {entity?.label && <span className="change-item__label">{entity.label}</span>}
                    </span>
                    {group.kind !== 'new' && <FieldList change={change} />}
                    {group.kind === 'new' && (
                      <ul className="change-item__fields">
                        <li><small>{entity?.fields.length ?? 0} colunas</small></li>
                      </ul>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </details>
      ))}

      {newRelations.length > 0 && (
        <details className="changes__group">
          <summary><Icon name="chevronDown" size={14} />Ligações novas <span className="tag tag--new">{newRelations.length}</span></summary>
          <ul className="changes__list">
            {newRelations.map((relation) => (
              <li key={relation.uid}>
                <div className="change-item">
                  <span className="change-item__head">
                    <span className="change-item__name">{relation.from} → {relation.to}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {freshNotes.length > 0 && (
        <details className="changes__group" open>
          <summary><Icon name="chevronDown" size={14} />Notas novas <span className="tag tag--note">{freshNotes.length}</span></summary>
          <ul className="changes__list">
            {freshNotes.map((note) => (
              <li key={note.uid}>
                <button className="change-item" onClick={() => onGo('note', note.uid)}>
                  <span className="change-item__head">
                    <Icon name="note" size={13} />
                    <span className="change-item__label">{note.anchor || 'nota solta'}</span>
                  </span>
                  <p className="change-item__note">{firstLine(note.text)}</p>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {changes && (changes.removedEntities.length > 0 || changes.removedRelations.length > 0) && (
        <details className="changes__group">
          <summary><Icon name="chevronDown" size={14} />Saíram <span className="tag tag--removed">{changes.removedEntities.length + changes.removedRelations.length}</span></summary>
          <ul className="changes__list">
            {changes.removedEntities.map((entity) => (
              <li key={`tabela-${entity.name}`}>
                <div className="change-item">
                  <span className="change-item__head">
                    <span className="mark mark--removed">−</span>
                    <span className="change-item__name">{entity.name}</span>
                    <span className="change-item__label">tabela</span>
                  </span>
                </div>
              </li>
            ))}
            {changes.removedRelations.map((relation) => (
              <li key={`ligacao-${relationKey(relation)}`}>
                <div className="change-item">
                  <span className="change-item__head">
                    <span className="mark mark--removed">−</span>
                    <span className="change-item__name">{relation.from} → {relation.to}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <details className="disclosure">
        <summary><Icon name="chevronDown" size={14} />Sobre o arquivo</summary>
        <DocInspector doc={doc} actions={actions} locked={locked} />
      </details>
    </>
  )
}
