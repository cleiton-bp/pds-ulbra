import { MiniCard, type MiniCardProps } from '@/shared/components/cardFace'
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
 * parecer um quadro em uso e `columnClassName` para as colunas repartirem a largura.
 */
export function MiniBoard({
  columns,
  card,
  cardColumnId,
  otherCards,
  columnClassName,
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
  /** Troca a largura fixa de cada coluna — a maquete da entrada as reparte na moldura. */
  columnClassName?: string
  className?: string
}) {
  const colunaDoCard = cardColumnId ?? columns[0]?.id ?? null

  return (
    <ul aria-label="Quadro de exemplo" className={cn('flex gap-2 overflow-x-auto pb-1', className)}>
      {columns.map((coluna) => (
        <li
          key={coluna.id}
          className={cn(
            'flex w-36 flex-none flex-col rounded-lg border border-transparent bg-surface-sunken dark:border-border',
            columnClassName,
          )}
        >
          <header className="flex flex-wrap items-center gap-1 px-2 pt-2 pb-1.5">
            <h3
              title={coluna.name}
              className="min-w-0 max-w-full truncate font-semibold text-caption text-fg-muted uppercase tracking-wide"
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
            {card && coluna.id === colunaDoCard && <MiniCard {...card} />}
            {otherCards?.[coluna.id]?.map((outro) => (
              <MiniCard key={outro.title} {...outro} />
            ))}
          </div>

          {coluna.publicStage !== undefined && (
            <p className="border-border border-t px-2 py-1.5 text-caption text-fg-muted leading-snug">
              Quem relatou vê:{' '}
              <span className={coluna.publicStage === null ? 'italic' : 'text-fg'}>
                {coluna.publicStage ?? 'nenhuma etapa'}
              </span>
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}
