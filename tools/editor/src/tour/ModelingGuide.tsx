import type { ReactNode } from 'react'
import { relationLabel } from '../modeling/model/constants'
import type { ChangeSet } from '../modeling/model/diff'
import type { Entity, Field, ModelDoc, Relation } from '../modeling/types'
import { count, gist, names } from './explain'
import type { Explain } from './steps'

type GuideProps = {
  topic: Exclude<Explain, 'case'>
  doc: ModelDoc
  changes: ChangeSet | null
  /** O titulo do arquivo comparado, para dizer "Comparado com O time (08)". */
  baseTitle: string
}

/** Uma linha da explicacao: o sinal (bolinha, marca, exemplo) e a frase. */
function Item({ sign, children }: { sign: ReactNode; children: ReactNode }) {
  return (
    <li className="tour-explain__item">
      <span className="tour-explain__sign">{sign}</span>
      <span>{children}</span>
    </li>
  )
}

const Dot = ({ tone }: { tone: 'new' | 'changed' | 'removed' | 'note' }) => (
  <span className={`tour-explain__dot tour-explain__dot--${tone}`} aria-hidden="true" />
)

/** "Este arquivo": do que ele trata, o que traz de novo e o que veio de antes. */
function FileTopic({ doc, changes, baseTitle }: Omit<GuideProps, 'topic'>) {
  const lead = gist(doc.meta.description)
  const kinds = [...(changes?.entities.values() ?? [])]
  const added = kinds.filter((change) => change.kind === 'new').map((change) => change.name)
  const changed = kinds.filter((change) => change.kind === 'changed').map((change) => change.name)
  const removed = changes?.removedEntities.map((entity) => entity.name) ?? []
  const notes = changes?.counts.newNotes ?? 0
  const before = doc.entities.length - added.length
  const nothing = changes && added.length + changed.length + removed.length + notes === 0

  return (
    <>
      <p className="tour-explain__kicker">Este arquivo</p>
      <h2 className="tour-explain__title">{doc.meta.title || 'Sem título'}</h2>
      {lead && <p className="tour-explain__lead">{lead}</p>}

      <section className="tour-explain__section">
        <p className="tour-explain__kicker">O que ele traz</p>
        {!changes && <p className="tour-explain__text">É o ponto de partida: os próximos arquivos crescem a partir daqui.</p>}
        {nothing && <p className="tour-explain__text">Nenhuma tabela mudou: só os textos foram revistos.</p>}
        {changes && !nothing && (
          <ul className="tour-explain__list">
            {added.length > 0 && (
              <Item sign={<Dot tone="new" />}>
                {count(added.length, 'tabela nova', 'tabelas novas')}
                <code className="tour-explain__names">{names(added)}</code>
              </Item>
            )}
            {changed.length > 0 && (
              <Item sign={<Dot tone="changed" />}>
                {count(changed.length, 'tabela mudou', 'tabelas mudaram')}
                <code className="tour-explain__names">{names(changed)}</code>
              </Item>
            )}
            {removed.length > 0 && (
              <Item sign={<Dot tone="removed" />}>
                {count(removed.length, 'tabela saiu', 'tabelas saíram')}
                <code className="tour-explain__names">{names(removed)}</code>
              </Item>
            )}
            {notes > 0 && (
              <Item sign={<Dot tone="note" />}>
                {count(notes, 'nota nova explica', 'notas novas explicam')} o porquê
              </Item>
            )}
          </ul>
        )}
        {changes && baseTitle && <p className="tour-explain__small">Comparado com {baseTitle}, o arquivo de antes.</p>}
      </section>

      <section className="tour-explain__section">
        <p className="tour-explain__kicker">No desenho</p>
        <p className="tour-explain__text">
          {count(doc.entities.length, 'tabela', 'tabelas')} e {count(doc.relations.length, 'ligação', 'ligações')}
          {changes && before > 0 && `, e ${before === 1 ? 'uma vem' : `${before} vêm`} de antes, para dar contexto`}.
        </p>
      </section>
    </>
  )
}

/**
 * A tabela do exemplo: uma das novas (ou alteradas) deste arquivo, de preferencia
 * com chave estrangeira, e o que mais precisa de explicacao. Dela, ate quatro
 * colunas: a chave, a estrangeira, uma obrigatoria e o que mais couber, na ordem
 * da tabela.
 */
function pickExample(doc: ModelDoc, changes: ChangeSet | null): { entity: Entity; fields: Field[] } | null {
  const kindOf = (entity: Entity) => changes?.entities.get(entity.name)?.kind
  const ordered = [
    ...doc.entities.filter((entity) => kindOf(entity) === 'new'),
    ...doc.entities.filter((entity) => kindOf(entity) === 'changed'),
    ...doc.entities.filter((entity) => !entity.inherited),
    ...doc.entities,
  ].filter((entity) => entity.fields.length > 0)
  const entity = ordered.find((item) => item.fields.some((field) => field.pk) && item.fields.some((field) => field.fk)) ?? ordered[0]
  if (!entity) return null

  const chosen = new Set<Field>()
  const add = (field: Field | undefined): void => { if (field && chosen.size < 4) chosen.add(field) }
  add(entity.fields.find((field) => field.pk))
  add(entity.fields.find((field) => field.fk))
  add(entity.fields.find((field) => field.required && !field.pk && !field.fk))
  for (const field of entity.fields) add(field)
  return { entity, fields: entity.fields.filter((field) => chosen.has(field)) }
}

/** A ligacao que a coluna estrangeira representa, e a tabela da outra ponta. */
function linkOf(doc: ModelDoc, entity: Entity, field: Field | undefined): { relation: Relation; other: string } | null {
  if (!field) return null
  for (const relation of doc.relations) {
    if (relation.to === entity.name && relation.toField === field.name) return { relation, other: relation.from }
    if (relation.from === entity.name && relation.fromField === field.name) return { relation, other: relation.to }
  }
  return null
}

/** O que a cardinalidade quer dizer, com as duas tabelas da ligacao. */
function cardinality(relation: Relation): ReactNode {
  const [from, to] = relation.kind === 'one-to-one' ? ['um', 'um']
    : relation.kind === 'many-to-many' ? ['vários', 'vários']
    : ['um', 'vários']
  return <>{from} em <code>{relation.from}</code>, {to} em <code>{relation.to}</code></>
}

/** "Como ler": uma tabela deste arquivo, em miniatura, e o que cada pedaço quer dizer. */
function ReadTopic({ doc, changes }: Omit<GuideProps, 'topic' | 'baseTitle'>) {
  const example = pickExample(doc, changes)
  if (!example) return <p className="tour-explain__text">Este arquivo ainda não tem tabelas.</p>

  const { entity, fields } = example
  const fk = fields.find((field) => field.fk)
  const link = linkOf(doc, entity, fk)
  const required = fields.some((field) => field.required)
  const unique = fields.some((field) => field.unique)
  const type = fields.find((field) => field.type)?.type
  const rest = entity.fields.length - fields.length

  return (
    <>
      <p className="tour-explain__kicker">Como ler uma tabela</p>
      <p className="tour-explain__text">Um exemplo daqui: <code>{entity.name}</code>.</p>

      <div className="tour-table" aria-hidden="true">
        <div className="tour-table__head">
          <span className="tour-table__name">{entity.name}</span>
          {entity.label && <span className="tour-table__label">{entity.label}</span>}
        </div>
        {fields.map((field) => (
          <div key={field.uid} className="tour-table__row">
            <span>
              {field.pk ? <span className="badge badge--pk">PK</span> : field.fk ? <span className="badge badge--fk">FK</span> : null}
            </span>
            <span className="tour-table__col">
              {field.name}
              {field.required && <span className="entity-node__required">*</span>}
            </span>
            <span className="tour-table__type">
              {field.unique && <span className="badge badge--unique">U</span>} {field.type}
            </span>
          </div>
        ))}
        {rest > 0 && <div className="tour-table__more">e mais {count(rest, 'coluna', 'colunas')}</div>}
      </div>

      <section className="tour-explain__section">
        <ul className="tour-explain__list">
          <Item sign={<span className="tour-explain__mono">Aa</span>}>
            {entity.label ? 'Em cima fica o nome da tabela, e embaixo, o que ela guarda.' : 'Em cima fica o nome da tabela.'}
          </Item>
          <Item sign={<span className="badge badge--pk">PK</span>}>Identifica cada linha e nunca se repete.</Item>
          {fk && (
            <Item sign={<span className="badge badge--fk">FK</span>}>
              Aponta para outra tabela{link ? <>: <code>{fk.name}</code> leva a <code>{link.other}</code>.</> : '.'}
            </Item>
          )}
          {required && <Item sign={<span className="entity-node__required">*</span>}>Obrigatório: não fica vazio.</Item>}
          {unique && <Item sign={<span className="badge badge--unique">U</span>}>Único: não se repete entre as linhas.</Item>}
          {type && <Item sign={<span className="tour-explain__mono">{type}</span>}>O tipo do que fica guardado.</Item>}
          {link && (
            <Item sign={<span className="tour-explain__mono">{relationLabel(link.relation.kind)}</span>}>
              A linha entre as tabelas: {cardinality(link.relation)}.
            </Item>
          )}
          {changes && <Item sign={<span className="tour-explain__mono">+ ~</span>}>Coluna nova (+) ou que mudou (~) neste arquivo.</Item>}
        </ul>
      </section>
    </>
  )
}

/**
 * O painel da direita durante o tour: em vez do que aparece ao clicar numa tabela,
 * uma explicacao feita para quem chega, sobre esta modelagem e com os nomes dela.
 */
export default function ModelingGuide({ topic, doc, changes, baseTitle }: GuideProps) {
  return (
    <section key={topic} className="panel tour-explain" aria-label="explicação do tour">
      {topic === 'file'
        ? <FileTopic doc={doc} changes={changes} baseTitle={baseTitle} />
        : <ReadTopic doc={doc} changes={changes} />}
    </section>
  )
}
