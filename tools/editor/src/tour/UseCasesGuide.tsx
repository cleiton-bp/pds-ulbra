import type { ReactNode } from 'react'
import type { Actor, Link, Ref, UseCase, UseCaseDoc } from '../use-cases/types'
import { count, gist, names } from './explain'
import type { Explain } from './steps'

/** Uma linha da explicacao: o desenho em miniatura e a frase. */
function Item({ sign, children }: { sign: ReactNode; children: ReactNode }) {
  return (
    <li className="tour-explain__item">
      <span className="tour-explain__sign">{sign}</span>
      <span>{children}</span>
    </li>
  )
}

/** As formas do desenho, pequenas, no traco do canvas. */
const Glyph = ({ children, width = 28, height = 22 }: { children: ReactNode; width?: number; height?: number }) => (
  <svg className="tour-explain__glyph" width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

const PERSON = <Glyph><circle cx="14" cy="4.5" r="3" /><path d="M14 7.5v7M8.5 10h11M14 14.5l-4 6M14 14.5l4 6" /></Glyph>
// O sistema externo e a caixa com o rotulo; o retangulo do sistema guarda as elipses.
const SYSTEM = <Glyph><rect x="3" y="4" width="22" height="14" rx="2" /><path d="M9 9.5h10M11 13h6" /></Glyph>
const USE_CASE = <Glyph><ellipse cx="14" cy="11" rx="12" ry="6.5" /></Glyph>
const LINE = <Glyph><path d="M2 11h24" /></Glyph>
const DASHED = <Glyph><path d="M2 11h21" strokeDasharray="3 3" /><path d="M20 7.5 24.5 11 20 14.5" /></Glyph>
const INHERITS = <Glyph><path d="M2 11h18" /><path d="M19 6.5 26 11l-7 4.5z" /></Glyph>
const BOUNDARY = <Glyph><rect x="2" y="2" width="24" height="18" rx="1" /><ellipse cx="14" cy="12" rx="7" ry="3.5" /></Glyph>

const uidOf = (ref: Ref): string | undefined => ('uid' in ref ? ref.uid : undefined)

/** Liga as duas pontas, em qualquer sentido. */
const joins = (link: Link, a: string, b: string): boolean => {
  const from = uidOf(link.from)
  const to = uidOf(link.to)
  return (from === a && to === b) || (from === b && to === a)
}

/** Quem faz o caso de uso: os atores ligados a ele por uma linha simples. */
function actorsOf(doc: UseCaseDoc, useCase: UseCase): Actor[] {
  return doc.actors.filter((actor) => doc.links.some((link) => link.kind === 'association' && joins(link, actor.uid, useCase.uid)))
}

/** Quantos casos de uso o ator faz. */
function casesOf(doc: UseCaseDoc, actor: Actor): number {
  return doc.useCases.filter((useCase) => doc.links.some((link) => link.kind === 'association' && joins(link, actor.uid, useCase.uid))).length
}

const UseCaseName = ({ useCase }: { useCase: UseCase }) => (
  <><b>{useCase.id}</b> {useCase.name || 'sem nome'}</>
)

/** "Este arquivo": do que ele trata, quem aparece (e quanto faz) e o que da para fazer. */
function FileTopic({ doc }: { doc: UseCaseDoc }) {
  const lead = gist(doc.meta.description)
  const shown = doc.actors.slice(0, 5)
  const first = doc.useCases.slice(0, 3)

  return (
    <>
      <p className="tour-explain__kicker">Este arquivo</p>
      <h2 className="tour-explain__title">{doc.meta.title || 'Sem título'}</h2>
      {lead && <p className="tour-explain__lead">{lead}</p>}

      <section className="tour-explain__section">
        <p className="tour-explain__kicker">Quem aparece</p>
        {doc.actors.length === 0 && <p className="tour-explain__text">Ninguém ainda.</p>}
        <ul className="tour-explain__list">
          {shown.map((actor) => {
            const done = casesOf(doc, actor)
            return (
              <Item key={actor.uid} sign={actor.kind === 'system' ? SYSTEM : PERSON}>
                {actor.name || 'sem nome'}
                {done > 0 && (
                  <span className="tour-explain__aside">
                    {actor.kind === 'system' ? `participa de ${done}` : `faz ${count(done, 'caso', 'casos')}`}
                  </span>
                )}
              </Item>
            )
          })}
        </ul>
        {doc.actors.length > shown.length && <p className="tour-explain__small">e mais {doc.actors.length - shown.length}.</p>}
      </section>

      <section className="tour-explain__section">
        <p className="tour-explain__kicker">O que dá para fazer</p>
        {doc.useCases.length === 0 && <p className="tour-explain__text">Nenhum caso de uso ainda.</p>}
        <ul className="tour-explain__list">
          {first.map((useCase) => (
            <Item key={useCase.uid} sign={<code className="tour-explain__mono">{useCase.id}</code>}>{useCase.name || 'sem nome'}</Item>
          ))}
        </ul>
        {doc.useCases.length > first.length && (
          <p className="tour-explain__small">e mais {count(doc.useCases.length - first.length, 'caso de uso', 'casos de uso')}.</p>
        )}
      </section>
    </>
  )
}

/**
 * O pedaco do desenho que o exemplo mostra: um ator, um caso de uso que ele faz e,
 * quando o arquivo tem, um «include» ou «extend» preso a esse caso, que e o que mais
 * precisa de explicacao. Sem ator ligado, so o caso.
 */
function pickScene(doc: UseCaseDoc): { actor?: Actor; base?: UseCase; other?: UseCase; link?: Link } {
  const byUid = (uid: string | undefined) => doc.useCases.find((useCase) => useCase.uid === uid)
  for (const link of doc.links) {
    if (link.kind !== 'include' && link.kind !== 'extend') continue
    // No include, a ponta de saida sempre executa a outra; no extend, a ponta de
    // saida acrescenta algo a outra. A base e a que o ator faz.
    const base = link.kind === 'include' ? byUid(uidOf(link.from)) : byUid(uidOf(link.to))
    const other = link.kind === 'include' ? byUid(uidOf(link.to)) : byUid(uidOf(link.from))
    const actor = base && actorsOf(doc, base)[0]
    if (base && other && actor) return { actor, base, other, link }
  }
  for (const useCase of doc.useCases) {
    const actors = actorsOf(doc, useCase)
    const actor = actors.find((item) => item.kind === 'person') ?? actors[0]
    if (actor) return { actor, base: useCase }
  }
  return { base: doc.useCases[0] }
}

/** O boneco do exemplo, um pouco maior que o da lista. */
const FIGURE = (
  <Glyph width={22} height={30}>
    <circle cx="11" cy="5" r="3.5" />
    <path d="M11 8.5v10M4.5 12.5h13M11 18.5l-5 9M11 18.5l5 9" />
  </Glyph>
)

/** "Como ler": um pedaco deste desenho, em miniatura, e o que cada forma quer dizer. */
function ReadTopic({ doc }: { doc: UseCaseDoc }) {
  const { actor, base, other, link } = pickScene(doc)
  const system = doc.actors.find((item) => item.kind === 'system')?.name
  const has = (kind: string): boolean => doc.links.some((item) => item.kind === kind)
  // O include aponta para o caso que e executado (para baixo, no exemplo); o
  // extend, para o caso que e estendido (para cima).
  const down = link?.kind === 'include'

  return (
    <>
      <p className="tour-explain__kicker">Como ler o desenho</p>

      {base && (
        <div className="tour-scene" aria-hidden="true">
          <span className="tour-scene__actor">
            {actor && (actor.kind === 'system' ? SYSTEM : FIGURE)}
            {actor && <span>{actor.name}</span>}
          </span>
          <span className={actor ? 'tour-scene__wire' : ''} />
          <span className="tour-scene__case"><UseCaseName useCase={base} /></span>
          {other && link && (
            <>
              <span className="tour-scene__link">
                <Glyph width={14} height={34}>
                  <path d="M7 3v28" strokeDasharray="3 3" />
                  {down ? <path d="M3.5 27 7 31.5 10.5 27" /> : <path d="M3.5 7 7 2.5 10.5 7" />}
                </Glyph>
                <code>{link.kind === 'include' ? '«include»' : '«extend»'}</code>
              </span>
              <span className="tour-scene__case tour-scene__case--sub"><UseCaseName useCase={other} /></span>
            </>
          )}
        </div>
      )}

      <section className="tour-explain__section">
        <ul className="tour-explain__list">
          <Item sign={PERSON}>Um papel de quem usa o sistema.</Item>
          {system && <Item sign={SYSTEM}>Outro sistema que participa, como <strong>{system}</strong>.</Item>}
          <Item sign={USE_CASE}>Algo que dá para fazer, com o código dele.</Item>
          <Item sign={LINE}>Quem faz o quê.</Item>
          {has('include') && <Item sign={DASHED}><code>«include»</code>: sempre acontece junto.</Item>}
          {has('extend') && <Item sign={DASHED}><code>«extend»</code>: só às vezes.</Item>}
          {has('generalization') && <Item sign={INHERITS}>Faz tudo o que o outro faz, e mais.</Item>}
          <Item sign={BOUNDARY}>O retângulo é o sistema: o que fica dentro, ele faz.</Item>
        </ul>
      </section>
    </>
  )
}

/**
 * O caso do exemplo: um com os passos escritos, de preferencia tambem com o que pode
 * dar diferente, para mostrar todas as partes de uma vez.
 */
export function pickCase(doc: UseCaseDoc): UseCase | undefined {
  const written = doc.useCases.filter((useCase) => useCase.mainFlow.length > 0)
  return written.find((useCase) => useCase.alternativeFlows.length > 0 && useCase.preconditions)
    ?? written.find((useCase) => useCase.alternativeFlows.length > 0)
    ?? written[0]
}

/** "Por dentro": um caso de uso deste arquivo, com o antes, os passos, o diferente e o fim. */
function CaseTopic({ doc }: { doc: UseCaseDoc }) {
  const useCase = pickCase(doc)
  if (!useCase) return <p className="tour-explain__text">Os casos daqui ainda não têm os passos escritos.</p>

  const who = actorsOf(doc, useCase).map((actor) => actor.name)
  const steps = useCase.mainFlow.slice(0, 3)
  const alternative = useCase.alternativeFlows[0]

  return (
    <>
      <p className="tour-explain__kicker">Um caso por dentro</p>
      <div className="tour-case">
        <p className="tour-case__name"><UseCaseName useCase={useCase} /></p>
        {who.length > 0 && <p className="tour-case__who">Quem faz: {names(who)}</p>}

        {useCase.preconditions && (
          <div className="tour-case__part">
            <span className="tour-case__label">Antes de começar</span>
            <p className="tour-case__text">{useCase.preconditions}</p>
          </div>
        )}

        <div className="tour-case__part">
          <span className="tour-case__label">O caminho de sempre</span>
          <ol className="tour-case__steps">
            {steps.map((step, index) => <li key={index}><span className="tour-case__step">{step}</span></li>)}
          </ol>
          {useCase.mainFlow.length > steps.length && (
            <p className="tour-explain__small">e mais {count(useCase.mainFlow.length - steps.length, 'passo', 'passos')}.</p>
          )}
        </div>

        {alternative && (
          <div className="tour-case__part">
            <span className="tour-case__label">Se der diferente</span>
            <p className="tour-case__text">{alternative.title}</p>
            {useCase.alternativeFlows.length > 1 && (
              <p className="tour-explain__small">e mais {count(useCase.alternativeFlows.length - 1, 'caminho', 'caminhos')}.</p>
            )}
          </div>
        )}

        {useCase.postconditions && (
          <div className="tour-case__part">
            <span className="tour-case__label">No fim</span>
            <p className="tour-case__text">{useCase.postconditions}</p>
          </div>
        )}
      </div>
      <p className="tour-explain__small">Clique numa elipse para ver o caso inteiro.</p>
    </>
  )
}

/**
 * O painel da direita durante o tour: em vez do que aparece ao clicar num elemento,
 * uma explicacao feita para quem chega, sobre este arquivo e com os nomes dele.
 */
export default function UseCasesGuide({ topic, doc }: { topic: Explain; doc: UseCaseDoc }) {
  return (
    <section key={topic} className="panel tour-explain" aria-label="explicação do tour">
      {topic === 'file' ? <FileTopic doc={doc} /> : topic === 'read' ? <ReadTopic doc={doc} /> : <CaseTopic doc={doc} />}
    </section>
  )
}
