import type { ReactNode } from 'react'
import type { ReportSummaryViewModel } from '@/contracts'
import { CardTypeIcon } from '@/features/reports/cardLook'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { teamTypeLabel } from '@/shared/lib/teamReportTypes'

/**
 * A largura e a altura do card aberto: largo no computador, a tela quase inteira no
 * celular.
 *
 * **No computador a altura e fixa**, e nao a do conteudo: com a altura do conteudo, o
 * card curto aparecia mais baixo, e o X, o status e os campos mudavam de lugar a cada
 * card aberto — ir do pai para a subtarefa era procurar tudo de novo.
 */
export const CARD_DIALOG_WIDTH = 'w-[min(66rem,calc(100vw-2rem))]'
export const CARD_DIALOG_CLASS =
  'flex max-h-[calc(100dvh-2rem)] flex-col md:h-[min(54rem,calc(100dvh-4rem))] md:max-h-none'

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
 * depois onde ele esta, depois as subtarefas e os vinculos, depois a atividade. No
 * celular o uso tipico e "ver em que pe esta e mudar a coluna ou o responsavel": por
 * isso onde ele esta vem antes das subtarefas — com quatro delas, a coluna e o
 * responsavel ficavam abaixo da primeira tela. A ordem do documento e essa mesma — o
 * leitor de tela e o Tab seguem o que se ve. Por isso a troca entre os dois desenhos
 * e feita aqui, e nao so com CSS: com CSS, uma das duas larguras teria a ordem do
 * documento diferente da vista. Cruzar a largura com a janela aberta remonta o
 * conteudo, e um comentario pela metade se perde — o preco de a ordem estar certa.
 */
export function CardDetailLayout({
  cabeca,
  depois,
  lado,
  atividade,
}: {
  cabeca: ReactNode
  /** As subtarefas e os vinculos: embaixo do card no computador, depois de onde ele esta no celular. */
  depois?: ReactNode
  lado: ReactNode
  atividade: ReactNode
}) {
  const largo = useMediaQuery(DUAS_COLUNAS)

  if (largo)
    return (
      <div className="-mx-6 -mb-6 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_21rem] grid-rows-[minmax(0,1fr)] border-border border-t">
        <div className="flex min-h-0 min-w-0 flex-col gap-5 overflow-y-auto py-5 pr-8 pl-6">
          {cabeca}
          {depois}
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
        {depois && <div className="flex min-w-0 flex-col gap-5">{depois}</div>}
        <div className="flex min-w-0 flex-col gap-5">{atividade}</div>
      </div>
    </div>
  )
}

/**
 * O titulo do dialogo: o tipo (desenho e nome) e o numero do card — o mesmo par da
 * linha da lista e do pe do card no quadro.
 *
 * **Menor que o titulo do card**, logo abaixo: e a etiqueta de onde se esta, e o
 * titulo e o assunto. O relato diz que **e de fora** — ha uma pessoa esperando do
 * outro lado, e isso antes so se deduzia pelo protocolo e pela caixa amarela, la
 * embaixo.
 */
export function CardDialogTitle({ card }: { card: ReportSummaryViewModel | null }) {
  if (card === null) return <span className="text-detail text-fg-muted">Card</span>

  // A subtarefa e card do time, mas e assim que o time a chama.
  const tipo = card.Parent
    ? 'Subtarefa'
    : card.Kind === 'Team'
      ? 'Card do time'
      : card.Type
        ? teamTypeLabel(card.Type)
        : 'Relato'

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-detail text-fg-muted">
      {/* O nome do tipo ja vem escrito ao lado: o desenho fica so para os olhos. */}
      <span aria-hidden className="flex">
        <CardTypeIcon card={card} />
      </span>
      <span className="text-fg">{tipo}</span>
      <span className="font-mono">#{card.Number}</span>
      {card.Kind !== 'Team' && (
        <span className="rounded-full border border-warn-border bg-warn-surface px-2 py-px font-normal text-caption text-warn-fg">
          Relato de fora
        </span>
      )}
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
