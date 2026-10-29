import { useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { confirmDelete } from '../../../shared/Confirm'
import Icon from '../../../shared/Icon'
import type { ModelActions } from '../../hooks/useModelActions'
import { FIELD_FLAGS } from '../../model/constants'
import type { Entity, Field } from '../../types'

type EntityInspectorProps = {
  entity: Entity
  actions: ModelActions
  /** Coluna pedida pelo desenho (clique na linha da tabela): abre e rola ate ela. */
  focusField: { uid: string; seq: number } | null
}

/** As bandeiras por extenso, para o interruptor da coluna aberta. */
const FLAG_LABEL: Record<string, string> = {
  pk: 'Chave primária',
  fk: 'Chave estrangeira',
  required: 'Obrigatório',
  unique: 'Único',
}

/** A marca curta da bandeira ligada, na linha fechada: a mesma do desenho. */
const FLAG_MARK: Record<string, string> = { pk: 'PK', fk: 'FK', required: '*', unique: 'U' }

/**
 * Uma coluna da tabela. Fechada, e uma linha so (nome, marcas e tipo, como no
 * desenho), para a lista de quarenta colunas caber de relance. Aberta, mostra o
 * nome e o tipo editaveis, as bandeiras como interruptores e a observacao inteira.
 */
function ColumnItem({
  field, index, entityUid, open, actions, onToggle, onDragStart, onDragOver, onDrop,
}: {
  field: Field
  index: number
  entityUid: string
  open: boolean
  actions: ModelActions
  onToggle: () => void
  onDragStart: (event: DragEvent<HTMLLIElement>, index: number) => void
  onDragOver: (event: DragEvent<HTMLLIElement>) => void
  onDrop: (event: DragEvent<HTMLLIElement>, index: number) => void
}) {
  const ref = useRef<HTMLLIElement>(null)
  const set = (patch: Partial<Field>): void => actions.updateField(entityUid, field.uid, patch)

  // Aberta, entra na vista: quem abriu pelo desenho nao precisa procurar.
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [open])

  const marks = FIELD_FLAGS.filter(({ key }) => field[key])

  return (
    <li
      ref={ref}
      className={`col${open ? ' is-open' : ''}`}
      // Arrastar so com a coluna fechada: aberta, o arrasto brigaria com a selecao
      // do texto dos campos.
      draggable={!open}
      onDragStart={(event) => onDragStart(event, index)}
      onDragOver={onDragOver}
      onDrop={(event) => onDrop(event, index)}
    >
      <button className="col__row" aria-expanded={open} onClick={onToggle} title={open ? 'fechar a coluna' : 'abrir para editar'}>
        <span className="col__grip" aria-hidden="true" title="arraste para reordenar">⠿</span>
        <span className="col__name">{field.name || <em>sem nome</em>}</span>
        <span className="col__marks">
          {marks.map(({ key }) => (
            <span key={key} className={`col__mark col__mark--${key}`}>{FLAG_MARK[key]}</span>
          ))}
        </span>
        <span className="col__type">{field.type || 'sem tipo'}</span>
        <span className="col__chevron"><Icon name="chevronDown" size={14} /></span>
      </button>

      {open && (
        <div className="col__detail">
          <div className="col__pair">
            <label className="field-group">
              <span>Nome</span>
              <input
                className="mono"
                value={field.name}
                placeholder="nome_do_campo"
                autoFocus={!field.name}
                onChange={(event) => set({ name: event.target.value })}
              />
            </label>
            <label className="field-group">
              <span>Tipo</span>
              <input
                className="mono"
                value={field.type}
                placeholder="text"
                list="common-types"
                onChange={(event) => set({ type: event.target.value })}
              />
            </label>
          </div>

          <div className="toggles" role="group" aria-label="bandeiras da coluna">
            {FIELD_FLAGS.map(({ key, title }) => {
              const on = Boolean(field[key])
              return (
                <button
                  key={key}
                  className={`toggle toggle--${key}${on ? ' is-on' : ''}`}
                  aria-pressed={on}
                  title={title}
                  onClick={() => set({ [key]: !on } as Partial<Field>)}
                >
                  <span className="toggle__box" aria-hidden="true">{on && <Icon name="check" size={12} />}</span>
                  <span>{FLAG_LABEL[key]}</span>
                </button>
              )
            })}
          </div>

          <label className="field-group">
            <span>Observação</span>
            <textarea
              className="autogrow"
              rows={2}
              value={field.note ?? ''}
              placeholder="o que esta coluna guarda, e por quê"
              onChange={(event) => set({ note: event.target.value })}
            />
          </label>

          <div className="col__actions">
            <button
              className="btn btn--ghost btn--small btn--danger-text"
              onClick={() => void confirmDelete({ title: `Remover a coluna ${field.name || 'sem nome'}?`, message: 'As ligações presas a ela passam para a borda da tabela.', confirmLabel: 'Remover coluna' }).then((ok) => ok && actions.deleteField(entityUid, field.uid))}
            >
              <Icon name="trash" size={14} />
              <span>Remover coluna</span>
            </button>
            <button className="btn btn--small" onClick={onToggle}>Fechar</button>
          </div>
        </div>
      )}
    </li>
  )
}

/**
 * O editor da tabela no painel: o nome e a descricao, as colunas e, recolhido, o que
 * quase nunca se mexe. Apagar fica no fim, longe do que se edita sempre.
 */
export default function EntityInspector({ entity, actions, focusField }: EntityInspectorProps) {
  // Reordenacao de campo por arrasto nativo: guarda de onde saiu ate o solta.
  const dragFrom = useRef<number | null>(null)
  const [openUid, setOpenUid] = useState<string>('')

  // O desenho pediu uma coluna: ela abre aqui.
  useEffect(() => {
    if (focusField) setOpenUid(focusField.uid)
  }, [focusField?.seq])

  // Coluna nova (o "+ Adicionar coluna") ja abre, com o nome pronto para digitar.
  const count = useRef(entity.fields.length)
  useEffect(() => {
    if (entity.fields.length > count.current) setOpenUid(entity.fields[entity.fields.length - 1]?.uid ?? '')
    count.current = entity.fields.length
  }, [entity.fields])

  const onDragStart = (event: DragEvent<HTMLLIElement>, index: number): void => {
    dragFrom.current = index
    event.dataTransfer.effectAllowed = 'move'
  }

  const onDragOver = (event: DragEvent<HTMLLIElement>): void => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const onDrop = (event: DragEvent<HTMLLIElement>, index: number): void => {
    event.preventDefault()
    const from = dragFrom.current
    if (from !== null && from !== index) actions.moveField(entity.uid, from, index)
    dragFrom.current = null
  }

  return (
    <div className="editor">
      <section className="editor__section">
        <h3 className="editor__title">Tabela</h3>
        <div className="col__pair">
          <label className="field-group">
            <span>Nome no código</span>
            <input
              className="mono"
              value={entity.name}
              placeholder="accounts"
              onChange={(event) => actions.renameEntity(entity.uid, event.target.value)}
            />
          </label>
          <label className="field-group">
            <span>Nome no domínio</span>
            <input
              value={entity.label}
              placeholder="Contas"
              onChange={(event) => actions.updateEntity(entity.uid, { label: event.target.value })}
            />
          </label>
        </div>

        <label className="field-group">
          <span>Descrição</span>
          <textarea
            className="autogrow"
            rows={3}
            value={entity.description}
            placeholder="para que serve esta tabela"
            onChange={(event) => actions.updateEntity(entity.uid, { description: event.target.value })}
          />
        </label>
      </section>

      <section className="editor__section">
        <h3 className="editor__title">
          Colunas <span className="editor__count">{entity.fields.length}</span>
        </h3>
        {entity.fields.length > 0 && (
          <ul className="cols">
            {entity.fields.map((field, index) => (
              <ColumnItem
                key={field.uid}
                field={field}
                index={index}
                entityUid={entity.uid}
                open={openUid === field.uid}
                actions={actions}
                onToggle={() => setOpenUid((current) => (current === field.uid ? '' : field.uid))}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
              />
            ))}
          </ul>
        )}
        {entity.fields.length === 0 && <p className="editor__empty">Ainda sem colunas: comece pela chave primária.</p>}
        <button className="btn btn--add" onClick={() => actions.addField(entity.uid)}>
          <Icon name="plus" />
          <span>Adicionar coluna</span>
        </button>
      </section>

      <details className="disclosure">
        <summary><Icon name="chevronDown" size={14} />Mais opções</summary>
        <label className="switch">
          <input
            type="checkbox"
            checked={entity.inherited}
            onChange={(event) => actions.updateEntity(entity.uid, { inherited: event.target.checked })}
          />
          <span className="switch__track" aria-hidden="true" />
          <span className="switch__text">
            Veio da modelagem anterior
            <small>marca escrita no arquivo, para quem lê o YAML; a comparação do editor não depende dela</small>
          </span>
        </label>
      </details>

      <div className="danger-zone">
        <button
          className="btn btn--danger"
          onClick={() => void confirmDelete({ title: `Apagar a tabela ${entity.name}?`, message: 'As ligações dela saem junto.', confirmLabel: 'Apagar tabela' }).then((ok) => ok && actions.deleteEntity(entity.uid))}
        >
          <Icon name="trash" size={14} />
          <span>Apagar tabela</span>
        </button>
      </div>
    </div>
  )
}
