import { MiniCard, type MiniCardProps } from '@/shared/components/cardFace'
import { type StatusTone, TONE_DOT, TONE_FG, TONE_SURFACE } from '@/shared/components/statusTone'
import { cn } from '@/shared/lib/cn'

/** Uma coluna do quadro de exemplo. */
export interface MiniBoardColumn {
  id: string
  name: string
  /** O que a coluna faz de diferente, dito por extenso: "Encerra", "Entrada: Defeito". */
  tags?: string[]
  /**
   * A etapa do andamento que quem relatou le com o card nesta coluna. Sem ela
   * (`undefined`), a faixa nao aparece; nula, a coluna ainda nao cai em etapa nenhuma.
   */
  publicStage?: string | null
}

/**
 * Um quadro de exemplo, para a previa de Colunas: os cabecalhos na ordem, um card de
 * exemplo numa coluna e, embaixo de cada uma, o que quem relatou ve com o card ali.
 * **Puro** — nada aqui pede a API —, e com o desenho do quadro de verdade: o cabecalho
 * em caixa alta e o card montado com as pecas da frente do card (`MiniCard`).
 *
 * A faixa embaixo e o motivo da previa: a coluna e do time, e a etapa e o que a pessoa
 * de fora le — ver as duas lado a lado mostra a perda de detalhe que e de proposito.
 *
 * A tela de entrada usa o mesmo quadro na maquete do produto, com `otherCards` para ele
 * parecer um quadro em uso, `columnClassName` para as colunas repartirem a largura, e
 * `cardSlot` e `highlightColumnId` para o visitante arrastar o card de uma coluna a outra.
 */
export function MiniBoard({
  columns,
  card,
  cardColumnId,
  otherCards,
  cardSlot,
  highlightColumnId = null,
  dropSlot,
  tones,
  stageLitColumnId = null,
  columnClassName,
  stageLabel = true,
  className,
}: {
  columns: MiniBoardColumn[]
  /** O card de exemplo; sem ele, so as colunas. */
  card?: MiniCardProps
  /** Em que coluna o card aparece. Sem ela, na primeira. */
  cardColumnId?: string | null
  /**
   * O que ja estava em cada coluna, pelo id dela. O card de exemplo fica em cima
   * deles: o que chega vai ao topo, como no quadro de verdade.
   */
  otherCards?: Readonly<Partial<Record<string, readonly MiniCardProps[]>>>
  /**
   * Um card pronto no lugar do `card`, na coluna de `cardColumnId`: o da maquete da
   * entrada, que o visitante pega e solta, desenhado por quem o move.
   */
  cardSlot?: React.ReactNode
  /** A coluna que recebe o card que esta sendo arrastado, realcada pelo id. */
  highlightColumnId?: string | null
  /** O lugar aberto no topo da coluna realcada, onde o card arrastado vai cair. */
  dropSlot?: React.ReactNode
  /**
   * O tom de cada coluna, pelo id: liga o ponto de cor antes do nome e pinta, no tom, a
   * coluna realcada e a faixa acesa. Sem ele, o quadro fica neutro, como nas previas.
   */
  tones?: Readonly<Partial<Record<string, StatusTone>>>
  /** A coluna cuja faixa "Quem relatou vê" acende no tom: a do card, ja nesta etapa. */
  stageLitColumnId?: string | null
  /** Troca a largura fixa de cada coluna — a maquete da entrada as reparte na moldura. */
  columnClassName?: string
  /**
   * O rotulo antes da etapa, embaixo de cada coluna. Falso, so a etapa aparece: quem tem
   * uma legenda so para o quadro inteiro (o Novo projeto, com cinco colunas estreitas)
   * nao repete a frase em cada uma.
   */
  stageLabel?: boolean
  className?: string
}) {
  const colunaDoCard = cardColumnId ?? columns[0]?.id ?? null

  return (
    <ul aria-label="Quadro de exemplo" className={cn('flex gap-2 overflow-x-auto pb-1', className)}>
      {columns.map((coluna) => {
        const tom = tones?.[coluna.id]
        const realcada = coluna.id === highlightColumnId
        const acesa = tom !== undefined && coluna.id === stageLitColumnId
        return (
          <li
            key={coluna.id}
            data-column-id={coluna.id}
            className={cn(
              'flex w-36 flex-none flex-col rounded-lg border bg-surface-sunken transition-colors duration-150',
              realcada
                ? tom
                  ? TONE_SURFACE[tom]
                  : 'border-border-control bg-surface-strong'
                : 'border-transparent dark:border-border',
              columnClassName,
            )}
          >
            <header className="flex flex-wrap items-center gap-1.5 px-2 pt-2 pb-1.5">
              {tom && (
                <span
                  aria-hidden="true"
                  className={cn('size-2 flex-none rounded-full', TONE_DOT[tom])}
                />
              )}
              <h3
                title={coluna.name}
                className="min-w-0 max-w-full truncate font-semibold text-caption text-fg"
              >
                {coluna.name}
              </h3>
              {coluna.tags?.map((marca) => (
                <span
                  key={marca}
                  className="rounded border border-border px-1 text-caption text-fg-muted"
                >
                  {marca}
                </span>
              ))}
            </header>

            <div className="flex min-h-14 flex-1 flex-col gap-2 px-2 pb-2">
              {coluna.id === highlightColumnId && dropSlot}
              {coluna.id === colunaDoCard && (cardSlot ?? (card && <MiniCard {...card} />))}
              {otherCards?.[coluna.id]?.map((outro) => (
                <MiniCard key={outro.title} {...outro} />
              ))}
            </div>

            {coluna.publicStage !== undefined && (
              <p
                className={cn(
                  'rounded-b-[7px] border-t px-2 py-1.5 text-caption leading-snug transition-colors duration-300',
                  acesa && tom
                    ? cn(TONE_SURFACE[tom], TONE_FG[tom])
                    : 'border-border text-fg-muted',
                )}
              >
                {stageLabel && <>Quem relatou vê: </>}
                <span
                  className={
                    coluna.publicStage === null ? 'italic' : acesa ? 'font-medium' : 'text-fg'
                  }
                >
                  {coluna.publicStage ?? 'nenhuma etapa'}
                </span>
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
