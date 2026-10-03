import type { CardAssigneeViewModel, ReportSummaryViewModel } from '@/contracts'
import { CardChip } from '@/shared/components/CardChip'
import { DueChip } from '@/shared/components/DueChip'
import { cn } from '@/shared/lib/cn'
import { teamTypeLabel } from '@/shared/lib/teamReportTypes'

/**
 * A frente do card no quadro: **um resumo**. O detalhe abre so no clique, no mesmo
 * dialogo da lista — a frente diz o bastante para decidir o que arrastar, e nada
 * aqui pede o card a API (abrir registra leitura).
 *
 * Do titulo para baixo: o numero e o tipo, o titulo (o do time, senao o de quem
 * relatou, senao o comeco do texto), a prioridade e ate tres etiquetas, e no pe o
 * prazo com o destaque, os contadores e quem esta com o card.
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
  const doTime = card.Kind === 'Team'
  const titulo = card.Title ?? card.ReporterTitle
  const visiveis = card.Labels.slice(0, 3)
  const restantes = card.Labels.length - visiveis.length
  // O prazo tem linha propria; o pe e dos contadores e de quem esta com o card.
  const temPe = card.CommentCount > 0 || card.AttachmentCount > 0 || card.Assignee !== null

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface-raised p-3 text-left',
        lifted && 'shadow-lg ring-2 ring-accent',
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 text-caption text-fg-muted">
        <span className="font-mono text-fg">#{card.Number}</span>
        <span aria-hidden>·</span>
        <span>{doTime ? 'Do time' : card.Type ? teamTypeLabel(card.Type) : 'Relato'}</span>
      </div>

      <p
        className={cn(
          'line-clamp-3 break-words text-detail leading-snug',
          titulo ? 'text-fg' : 'text-fg-muted',
        )}
      >
        {titulo ?? card.Text}
      </p>

      {(card.Priority || visiveis.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {card.Priority && (
            <CardChip color={card.Priority.Color}>
              {card.Priority.IsActive ? card.Priority.Name : `${card.Priority.Name} (aposentada)`}
            </CardChip>
          )}
          {visiveis.map((etiqueta) => (
            <CardChip key={etiqueta.PublicId} color={etiqueta.Color}>
              {etiqueta.Name}
            </CardChip>
          ))}
          {restantes > 0 && <span className="text-caption text-fg-muted">+{restantes}</span>}
        </div>
      )}

      {card.DueDate && (
        <div className="mt-2 text-caption text-fg-muted">
          <DueChip day={card.DueDate} soonDays={soonDays} compact />
        </div>
      )}

      {temPe && (
        <div className="mt-2 flex items-center justify-between gap-2 text-caption text-fg-muted">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
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
          {card.Assignee && <Iniciais pessoa={card.Assignee} />}
        </div>
      )}
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

/**
 * Quem esta com o card, pelas iniciais — o nome inteiro nao cabe no card estreito,
 * e vai no `title` e no texto para leitor de tela. Quem saiu do time aparece
 * apagado, com a marca dita.
 */
function Iniciais({ pessoa }: { pessoa: CardAssigneeViewModel }) {
  const nome = pessoa.Name || 'Sem nome'
  const descricao = pessoa.InTeam ? `Com ${nome}` : `Com ${nome} (saiu do time)`

  return (
    <span
      title={descricao}
      className={cn(
        'flex size-6 flex-none items-center justify-center rounded-full border border-border bg-surface-sunken font-medium text-caption text-fg uppercase',
        !pessoa.InTeam && 'border-dashed text-fg-muted',
      )}
    >
      <span aria-hidden>{iniciais(nome)}</span>
      <span className="sr-only">{descricao}</span>
    </span>
  )
}

function iniciais(nome: string): string {
  // Sem nome no Google, a API manda o e-mail: a inicial e a do comeco dele.
  if (nome.includes('@')) return nome[0] ?? '?'
  const partes = nome.split(/\s+/).filter(Boolean)
  const primeira = partes[0]?.[0] ?? '?'
  const ultima = partes.length > 1 ? (partes.at(-1)?.[0] ?? '') : ''
  return `${primeira}${ultima}`
}
