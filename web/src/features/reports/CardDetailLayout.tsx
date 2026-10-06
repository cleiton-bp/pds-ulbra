import type { ReactNode } from 'react'
import type { ReportSummaryViewModel } from '@/contracts'
import { CardTypeIcon } from '@/features/reports/cardLook'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { teamTypeLabel } from '@/shared/lib/teamReportTypes'

/** A largura e a altura do card aberto: largo no computador, a tela quase inteira no celular. */
export const CARD_DIALOG_WIDTH = 'w-[min(66rem,calc(100vw-2rem))]'
export const CARD_DIALOG_CLASS =
  'flex max-h-[calc(100dvh-2rem)] flex-col md:max-h-[min(54rem,calc(100dvh-4rem))]'

/** A partir de onde o card aberto tem duas colunas — o `md` do Tailwind. */
const DUAS_COLUNAS = '(min-width: 48rem)'

/**
 * O card aberto em duas colunas: **o que o card e** a esquerda — titulo, texto,
 * anexos, reaberturas e encerramento — e, embaixo, a atividade (a conversa e a
 * historia); **onde ele esta** a direita — a coluna, as acoes e os detalhes (quem esta
 * com ele, prioridade, etiquetas, prazo, de onde veio).
 *
 * **Cada coluna rola por conta propria.** A conversa longa nao leva embora a coluna e
 * os campos, e a direita mais alta que a tela continua alcancavel ate o fim — pelo
 * mouse e pelo Tab.
 *
 * **No celular e uma coluna so**, que rola inteira, na ordem em que se le: o card,
 * depois onde ele esta, depois a atividade. A ordem do documento e essa mesma — o
 * leitor de tela e o Tab seguem o que se ve. Por isso a troca entre os dois desenhos
 * e feita aqui, e nao so com CSS: com CSS, uma das duas larguras teria a ordem do
 * documento diferente da vista. Cruzar a largura com a janela aberta remonta o
 * conteudo, e um comentario pela metade se perde — o preco de a ordem estar certa.
 */
export function CardDetailLayout({
  cabeca,
  lado,
  atividade,
}: {
  cabeca: ReactNode
  lado: ReactNode
  atividade: ReactNode
}) {
  const largo = useMediaQuery(DUAS_COLUNAS)

  if (largo)
    return (
      <div className="-mx-6 -mb-6 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_21rem] grid-rows-[minmax(0,1fr)] border-border border-t">
        <div className="flex min-h-0 min-w-0 flex-col gap-5 overflow-y-auto py-5 pr-8 pl-6">
          {cabeca}
          {atividade}
        </div>
        <div className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto border-border border-l px-6 py-5">
          {lado}
        </div>
      </div>
    )

  return (
    <div className="-mx-6 -mb-6 min-h-0 flex-1 overflow-y-auto border-border border-t px-6 pt-5 pb-6">
      <div className="flex flex-col gap-6">
        <div className="flex min-w-0 flex-col gap-5">{cabeca}</div>
        <div className="flex min-w-0 flex-col gap-4">{lado}</div>
        <div className="flex min-w-0 flex-col gap-5">{atividade}</div>
      </div>
    </div>
  )
}

/**
 * O titulo do dialogo: o tipo (desenho e nome) e o numero do card — o mesmo par da
 * linha da lista e do pe do card no quadro.
 */
export function CardDialogTitle({ card }: { card: ReportSummaryViewModel | null }) {
  if (card === null) return 'Card'

  const tipo =
    card.Kind === 'Team' ? 'Card do time' : card.Type ? teamTypeLabel(card.Type) : 'Relato'

  return (
    <span className="flex items-center gap-2">
      {/* O nome do tipo ja vem escrito ao lado: o desenho fica so para os olhos. */}
      <span aria-hidden className="flex">
        <CardTypeIcon card={card} />
      </span>
      <span>{tipo}</span>
      <span className="font-medium font-mono text-detail text-fg-muted">#{card.Number}</span>
    </span>
  )
}

/** A caixa "Detalhes" da coluna da direita: os campos do card e de onde ele veio. */
export function DetailsBox({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border">
      <h3 className="border-border border-b px-3.5 py-2.5 font-medium text-detail text-fg">
        Detalhes
      </h3>
      <div className="flex flex-col gap-3 px-3.5 py-3">{children}</div>
    </section>
  )
}

/**
 * Uma linha dos detalhes. Sai da tela quando nao ha valor: "Site: —" ocupa a mesma
 * altura de um dado para nao dizer nada.
 */
export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim().length === 0) return null

  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 text-detail">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{value}</dd>
    </div>
  )
}
