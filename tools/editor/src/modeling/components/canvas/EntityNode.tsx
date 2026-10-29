import { memo, useEffect } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { Handle, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import Icon from '../../../shared/Icon'
import type { FieldChange } from '../../model/diff'
import type { Field } from '../../types'
import { useCanvasEditing } from './EditingContext'
import { FLOW_POSITION, SIDES, handleId, type EntityFlowNode } from './nodeTypes'

/** O que a marca da tabela diz, pela comparacao com o arquivo-base. */
const KIND_TAG = {
  new: { text: 'nova', title: 'tabela que o arquivo-base não tinha' },
  changed: { text: 'alterada', title: 'colunas novas, removidas ou mudadas em relação ao arquivo-base' },
  text: { text: 'texto', title: 'só a explicação mudou: descrição, rótulo ou observação de coluna' },
} as const

const FIELD_MARK: Record<FieldChange['kind'], string> = { new: '+', changed: '~', text: '✎' }

const fieldTitle = (field: Field, change: FieldChange | undefined): string | undefined => {
  const parts = [
    change?.kind === 'new' ? 'coluna nova' : '',
    change?.kind === 'changed' ? `mudou: ${change.details.join(', ')}` : '',
    change?.kind === 'text' ? 'só a observação mudou' : '',
    field.note ?? '',
  ].filter(Boolean)
  return parts.length > 0 ? parts.join('\n') : undefined
}

/**
 * A caixa de tabela no canvas.
 *
 * Cada linha carrega dois pontos de conexao (esquerda e direita), entao a relacao
 * pode grudar no campo certo em vez de na borda: FK apontando para PK, como num
 * diagrama de banco. A borda da caixa tem os quatro lados, para quem quer ligar a
 * tabela inteira.
 *
 * Com a comparacao ligada, cada coluna diz se e nova (+), mudou (~) ou so teve a
 * observacao reescrita (✎), e as que sumiram aparecem riscadas no fim, so na tela.
 * Recolhida, a caixa mostra so o cabecalho: e a tabela que nao mudou.
 *
 * Clicar numa linha abre a coluna no painel; editando, o clique duplo abre o nome e
 * o tipo na propria linha (Enter confirma, Esc sai). A lista leva `nodrag` para o
 * clique na linha nao virar arrasto da caixa.
 */
function EntityNode({ id, data, selected }: NodeProps<EntityFlowNode>) {
  const { entity, dim, change, collapsed, notes, far, zoom } = data
  const { actions, editField, locked, showEntityNotes, inline, startInline, stopInline, lockedAttempt } = useCanvasEditing()
  const inlineUid = !locked && inline?.kind === 'field' && inline.entityUid === entity.uid ? inline.fieldUid : ''

  // O React Flow mede onde cada ponto de conexao esta uma vez. Toda mudanca que mexe
  // na altura das linhas (campo criado, removido, caixa recolhida) precisa avisar,
  // senao a linha continua grudada na altura antiga.
  const updateNodeInternals = useUpdateNodeInternals()
  const layoutKey = `${entity.fields.map((f) => f.uid).join(',')}|${selected}|${collapsed}|${inlineUid}|${change?.removedFields.length ?? 0}`
  useEffect(() => { updateNodeInternals(id) }, [id, layoutKey, updateNodeInternals])

  const onInlineKey = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault()
      stopInline()
    }
  }

  const openNotes = (event: MouseEvent): void => {
    event.stopPropagation()
    showEntityNotes(entity.uid)
  }

  const kind = change && change.kind !== 'same' ? change.kind : null

  const className = [
    'entity-node',
    selected ? 'is-selected' : '',
    dim ? 'is-dim' : '',
    collapsed ? 'is-collapsed' : '',
    kind ? `is-${kind}` : '',
  ].filter(Boolean).join(' ')

  // De longe, o nome cresce por cima da tabela, no tamanho que continua legivel
  // naquela distancia, e o resto esmaece. A caixa mantem o tamanho: nada pula, e as
  // ligacoes continuam presas nas mesmas colunas.
  const farFont = Math.max(13, Math.min(12 / Math.max(zoom, 0.05), 210 / (Math.max(entity.name.length, 4) * 0.62)))

  return (
    <div className={`${className}${far ? ' is-far' : ''}`} title={far ? (entity.label ? `${entity.name} (${entity.label})` : entity.name) : undefined}>
      {/* O nome de longe: por cima da caixa, aparece e some com transicao. */}
      <span className="entity-node__far-name" aria-hidden={!far} style={{ fontSize: farFont }}>{entity.name}</span>
      {/* Borda da caixa: os quatro lados, para ligar a tabela inteira. */}
      {SIDES.map((side) => (
        <Handle
          key={side}
          type="source"
          id={handleId.box(side)}
          position={FLOW_POSITION[side]}
          className="handle-box"
          isConnectable={!locked}
        />
      ))}

      <header className="entity-node__head">
        <span className="entity-node__names">
          <span className="entity-node__name">{entity.name}</span>
          {entity.label && <span className="entity-node__label">{entity.label}</span>}
        </span>
        {kind && <span className={`tag tag--${kind}`} title={KIND_TAG[kind].title}>{KIND_TAG[kind].text}</span>}
        {notes.total > 0 && (
          <button
            className={`entity-node__notes nodrag nopan${notes.fresh > 0 ? ' has-fresh' : ''}`}
            title={notes.fresh > 0
              ? `abrir no painel as ${notes.total} nota(s), ${notes.fresh} nova(s)`
              : `abrir no painel as ${notes.total} nota(s)`}
            aria-label={`abrir as ${notes.total} notas de ${entity.name}`}
            onClick={openNotes}
          >
            <Icon name="note" size={13} />
            <span>{notes.total}</span>
          </button>
        )}
      </header>

      {collapsed ? (
        <p className="entity-node__same">sem mudança, {entity.fields.length} colunas</p>
      ) : (
        <ul className="entity-node__fields nodrag nopan">
          {entity.fields.map((field) => {
            const fieldChange = change && change.kind !== 'new' ? change.fields.get(field.name) : undefined
            const hint = locked ? 'clique para ver no painel' : 'clique para abrir no painel, ou clique duplo para editar aqui'

            // Aberta no desenho: o nome e o tipo na propria linha, do mesmo tamanho dela.
            if (field.uid === inlineUid) {
              return (
                <li key={field.uid} className="entity-node__field is-inline" onKeyDown={onInlineKey}>
                  <Handle type="source" id={handleId.field(field.uid, 'left')} position={FLOW_POSITION.left} className="handle-field" isConnectable={false} />
                  <Handle type="source" id={handleId.field(field.uid, 'right')} position={FLOW_POSITION.right} className="handle-field" isConnectable={false} />
                  <span className="entity-node__mark" aria-hidden="true">✎</span>
                  <input
                    className="inline-input inline-input--name"
                    value={field.name}
                    placeholder="nome_do_campo"
                    aria-label="nome da coluna"
                    autoFocus
                    onFocus={(event) => event.target.select()}
                    onChange={(event) => actions.updateField(entity.uid, field.uid, { name: event.target.value })}
                  />
                  <input
                    className="inline-input inline-input--type"
                    value={field.type}
                    placeholder="tipo"
                    aria-label="tipo da coluna"
                    list="common-types"
                    onChange={(event) => actions.updateField(entity.uid, field.uid, { type: event.target.value })}
                  />
                  <button className="inline-done" title="pronto (Enter)" aria-label="pronto" onClick={(event) => { event.stopPropagation(); stopInline() }}>
                    <Icon name="check" size={14} />
                  </button>
                </li>
              )
            }

            return (
              <li
                key={field.uid}
                className={`entity-node__field${fieldChange ? ` is-${fieldChange.kind}` : ''}${locked ? ' is-locked' : ''}`}
                title={[fieldTitle(field, fieldChange), hint].filter(Boolean).join('\n')}
                onClick={(event) => { event.stopPropagation(); editField(entity.uid, field.uid) }}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  if (locked) lockedAttempt()
                  else startInline({ kind: 'field', entityUid: entity.uid, fieldUid: field.uid })
                }}
              >
                {/* Ponto de conexão da própria linha: some até passar o mouse. */}
                <Handle
                  type="source"
                  id={handleId.field(field.uid, 'left')}
                  position={FLOW_POSITION.left}
                  className="handle-field"
                  isConnectable={!locked}
                />
                <Handle
                  type="source"
                  id={handleId.field(field.uid, 'right')}
                  position={FLOW_POSITION.right}
                  className="handle-field"
                  isConnectable={!locked}
                />

                <span className="entity-node__mark" aria-hidden="true">{fieldChange ? FIELD_MARK[fieldChange.kind] : ''}</span>

                <span className="entity-node__badge">
                  {field.pk
                    ? <span className="badge badge--pk" title="chave primária">PK</span>
                    : field.fk
                      ? <span className="badge badge--fk" title="chave estrangeira">FK</span>
                      : null}
                </span>

                <span className="entity-node__field-name">
                  {field.name || <em>sem nome</em>}
                  {field.required && <span className="entity-node__required" title="obrigatório">*</span>}
                </span>

                <span className="entity-node__field-meta">
                  {field.unique && <span className="badge badge--unique" title="valor único">U</span>}
                  <span className="entity-node__field-type">{field.type}</span>
                </span>
              </li>
            )
          })}

          {/* O que o arquivo-base tinha e este tirou: riscado, sem ponto de conexão. */}
          {change?.removedFields.map((field) => (
            <li key={`removido-${field.name}`} className="entity-node__field is-removed" title="coluna que o arquivo-base tinha e este removeu">
              <span className="entity-node__mark" aria-hidden="true">−</span>
              <span className="entity-node__badge" />
              <span className="entity-node__field-name">{field.name}</span>
              <span className="entity-node__field-meta">
                <span className="entity-node__field-type">{field.type}</span>
              </span>
            </li>
          ))}

          {entity.fields.length === 0 && <li className="entity-node__empty">sem campos</li>}
        </ul>
      )}
    </div>
  )
}

export default memo(EntityNode)
