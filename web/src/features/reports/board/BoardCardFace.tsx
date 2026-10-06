import type { ReportSummaryViewModel } from '@/contracts'
import {
  CardTypeIcon,
  cardHeadline,
  MoreLabels,
  PersonAvatar,
  PriorityIcon,
} from '@/features/reports/cardLook'
import { CardChip } from '@/shared/components/CardChip'
import { DueChip } from '@/shared/components/DueChip'
import { cn } from '@/shared/lib/cn'

/**
 * A frente do card no quadro: **um resumo**. O detalhe abre so no clique, no mesmo
 * dialogo da lista — a frente diz o bastante para decidir o que arrastar, e nada
 * aqui pede o card a API (abrir registra leitura).
 *
 * **O titulo vem primeiro**, porque e ele que se le ao passar os olhos pela coluna (o
 * do time, senao o de quem relatou, senao o comeco do texto). Abaixo, ate tres
 * etiquetas e o prazo com o destaque; no pe, o tipo e o numero — o que localiza o
 * card —, a prioridade, os contadores e, na ponta, quem esta com ele.
 */
export function BoardCardFace({
  card,
  soonDays,
  lifted = false,
}: {
  card: ReportSummaryViewModel
  /** A regra do projeto para o prazo ficar perto (Ciclo). */
  soonDays: number
  /** O card que esta sendo arrastado: a copia que segue o ponteiro. */
  lifted?: boolean
}) {
  const titulo = cardHeadline(card)
  const visiveis = card.Labels.slice(0, 3)
  const restantes = card.Labels.length - visiveis.length

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface p-3 text-left shadow-xs transition-colors hover:bg-surface-raised',
        lifted && 'rotate-2 shadow-lg ring-2 ring-accent',
      )}
    >
      <p
        className={cn(
          'line-clamp-3 break-words text-body leading-snug',
          titulo.titled ? 'text-fg' : 'text-fg-muted',
        )}
      >
        {titulo.text}
      </p>

      {visiveis.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {visiveis.map((etiqueta) => (
            <CardChip key={etiqueta.PublicId} color={etiqueta.Color}>
              {etiqueta.Name}
            </CardChip>
          ))}
          {restantes > 0 && <MoreLabels labels={card.Labels.slice(visiveis.length)} />}
        </div>
      )}

      {card.DueDate && (
        <div className="mt-2 text-caption text-fg-muted">
          <DueChip day={card.DueDate} soonDays={soonDays} compact />
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2 text-caption text-fg-muted">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <CardTypeIcon card={card} />
            {/* O numero e como o time fala do card — no grupo, no commit, em voz alta. */}
            <span className="font-medium font-mono text-fg-muted">#{card.Number}</span>
          </span>
          {card.Priority && <PriorityIcon priority={card.Priority} />}
          {card.CommentCount > 0 && (
            <Contador
              quantos={card.CommentCount}
              rotulo={card.CommentCount === 1 ? 'comentário' : 'comentários'}
              desenho="M2.5 3.5h9v6h-5l-2.5 2v-2h-1.5z"
            />
          )}
          {card.AttachmentCount > 0 && (
            <Contador
              quantos={card.AttachmentCount}
              rotulo={card.AttachmentCount === 1 ? 'anexo' : 'anexos'}
              desenho="M9 4.5 5 8.5a1.4 1.4 0 0 0 2 2l4.2-4.2a2.6 2.6 0 0 0-3.7-3.7L3.3 6.8a3.8 3.8 0 0 0 5.4 5.4L12 9"
            />
          )}
        </div>
        {card.Assignee && <PersonAvatar pessoa={card.Assignee} />}
      </div>
    </div>
  )
}

/** Um numero da frente do card, com o desenho e — para quem nao ve — o que ele conta. */
function Contador({
  quantos,
  rotulo,
  desenho,
}: {
  quantos: number
  rotulo: string
  desenho: string
}) {
  return (
    <span className="inline-flex items-center gap-0.5 tabular-nums">
      <svg
        viewBox="0 0 14 14"
        className="size-3.5 flex-none"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={desenho} />
      </svg>
      {quantos}
      <span className="sr-only"> {rotulo}</span>
    </span>
  )
}
