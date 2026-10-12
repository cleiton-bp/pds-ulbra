import { useState } from 'react'
import type { CardAssigneeViewModel, CardLabelViewModel, CardPriorityViewModel } from '@/contracts'
import { CARD_COLOR_GLYPH, CardChip } from '@/shared/components/CardChip'
import { DueChip } from '@/shared/components/DueChip'
import { cn } from '@/shared/lib/cn'

/**
 * As pecas da frente do card que tambem desenham as previas da configuracao: as
 * etiquetas, a prioridade, os pontos e quem esta com o card. Moram em `shared` para a
 * previa de Prioridades, Etiquetas e Colunas usar **o mesmo desenho** do quadro — uma
 * previa com pecas parecidas mostraria um card que nao existe.
 *
 * `features/reports/cardLook` reexporta o que ja era dele: quem importa de la nao muda.
 */

/** Quantas etiquetas cabem na frente do card; o resto vira "+N". */
export const VISIBLE_LABELS = 3

/** Os pontos como o time le: "2,5", sem o ".0". */
export function formatPoints(pontos: number): string {
  return pontos.toLocaleString('pt-BR')
}

/** "1 ponto", "2,5 pontos". */
export function pointsText(pontos: number): string {
  return `${formatPoints(pontos)} ${pontos === 1 ? 'ponto' : 'pontos'}`
}

/** "3 pts", "1 pt": o numero com o que ele e — sozinho, ao lado do de comentarios, parecia contador. */
export function pointsShort(pontos: number): string {
  return `${formatPoints(pontos)} ${pontos === 1 ? 'pt' : 'pts'}`
}

/** Os pontos do card, num selo; sem estimativa, nada. */
export function PointsChip({ points }: { points: number | null }) {
  if (points === null) return null
  return (
    <span
      title={pointsText(points)}
      className="flex h-5 min-w-5 flex-none items-center justify-center whitespace-nowrap rounded-full bg-surface-sunken px-1.5 font-medium text-caption text-fg tabular-nums"
    >
      <span aria-hidden>{pointsShort(points)}</span>
      <span className="sr-only">{pointsText(points)}</span>
    </span>
  )
}

/**
 * As etiquetas que nao couberam, contadas: "+2". Quais sao vai no `title` e, para quem
 * usa leitor de tela, por extenso — o numero sozinho nao diz do que e.
 */
export function MoreLabels({ labels }: { labels: CardLabelViewModel[] }) {
  const nomes = labels.map((etiqueta) => etiqueta.Name).join(', ')

  return (
    <span title={nomes} className="text-caption text-fg-muted">
      +{labels.length}
      <span className="sr-only">
        {labels.length === 1 ? ' etiqueta: ' : ' etiquetas: '}
        {nomes}
      </span>
    </span>
  )
}

/**
 * A linha de etiquetas da frente do card: ate tres, na cor de cada uma, e "+N" para o
 * resto. Sem etiqueta, nada — nem o espaco.
 */
export function CardLabels({
  labels,
  className,
  highlight = null,
}: {
  labels: CardLabelViewModel[]
  className?: string
  /** A etiqueta que a previa de Etiquetas realca: a que esta aberta. O quadro nao usa. */
  highlight?: string | null
}) {
  if (labels.length === 0) return null
  const visiveis = labels.slice(0, VISIBLE_LABELS)

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {visiveis.map((etiqueta) => (
        <CardChip
          key={etiqueta.PublicId}
          color={etiqueta.Color}
          className={highlight === etiqueta.PublicId ? 'ring-2 ring-accent' : undefined}
        >
          {etiqueta.Name}
        </CardChip>
      ))}
      {labels.length > visiveis.length && <MoreLabels labels={labels.slice(visiveis.length)} />}
    </div>
  )
}

/** O nome da prioridade como a tela escreve: a aposentada vem marcada. */
export function priorityName(priority: CardPriorityViewModel) {
  return priority.IsActive ? priority.Name : `${priority.Name} (desativada)`
}

/**
 * A prioridade: o desenho na cor que o time escolheu, e o nome ao lado.
 *
 * **Um desenho so para todas.** As prioridades sao do projeto — o time renomeia,
 * reordena e cria outras —, entao uma seta para cima ou para baixo afirmaria um nivel
 * que a tela nao sabe. Quem diz qual e qual e o nome.
 */
export function PriorityIcon({ priority }: { priority: CardPriorityViewModel }) {
  const nome = priorityName(priority)

  return (
    <span title={`Prioridade ${nome}`} className="inline-flex min-w-0 items-center gap-1">
      <svg
        viewBox="0 0 12 12"
        className={cn('size-3.5 flex-none', CARD_COLOR_GLYPH[priority.Color])}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        aria-hidden
      >
        <path d="M2.6 9.6V7.8M6 9.6V5.2M9.4 9.6V2.6" />
      </svg>
      <span className="sr-only">Prioridade </span>
      <span className="min-w-0 truncate">{nome}</span>
    </span>
  )
}

/**
 * As iniciais de um nome: a primeira letra do primeiro e do ultimo pedaco **que
 * comeca com letra ou numero** — "Ana Souza (teste)" e AS, e nao A( nem At. Sem nome no Google,
 * a API manda o e-mail, e a inicial e a do comeco dele.
 */
export function initialsOf(nome: string): string {
  const letra = (pedaco: string) => pedaco.match(/^[\p{L}\p{N}]/u)?.[0] ?? ''
  if (nome.includes('@')) return letra(nome) || '?'

  const pedacos = nome.split(/\s+/).map(letra).filter(Boolean)
  const primeira = pedacos[0] ?? '?'
  const ultima = pedacos.length > 1 ? (pedacos.at(-1) ?? '') : ''
  return `${primeira}${ultima}`
}

/**
 * Quem esta com o card: a foto do Google, senao as iniciais. Quem saiu do time
 * aparece apagado, com a borda tracejada e a marca dita.
 *
 * A foto que nao carrega (link vencido, rede) cai nas iniciais, em vez de deixar um
 * circulo vazio — e a falha e da foto, e nao do lugar: trocar de pessoa tenta a foto
 * da nova.
 */
export function PersonAvatar({
  pessoa,
  size = 'sm',
}: {
  pessoa: CardAssigneeViewModel
  size?: 'sm' | 'md'
}) {
  const [falhou, setFalhou] = useState<string | null>(null)
  const nome = pessoa.Name || 'Sem nome'
  const descricao = pessoa.InTeam ? `Com ${nome}` : `Com ${nome} (saiu do time)`
  const foto = pessoa.AvatarUrl && pessoa.AvatarUrl !== falhou ? pessoa.AvatarUrl : null

  return (
    <span
      title={descricao}
      className={cn(
        'flex flex-none items-center justify-center overflow-hidden rounded-full border border-border bg-surface-sunken font-medium text-caption text-fg',
        size === 'sm' ? 'size-6' : 'size-7',
        !pessoa.InTeam && 'border-dashed text-fg-muted opacity-70',
      )}
    >
      {foto ? (
        <img
          src={foto}
          alt=""
          className="size-full"
          referrerPolicy="no-referrer"
          onError={() => setFalhou(foto)}
        />
      ) : (
        // A caixa alta e so das iniciais: no nome escondido, o leitor de tela soletraria.
        <span aria-hidden className="uppercase">
          {initialsOf(nome)}
        </span>
      )}
      <span className="sr-only">{descricao}</span>
    </span>
  )
}

/** O que o card de exemplo mostra. Tudo opcional menos o titulo: a previa liga o que ela ensina. */
export interface MiniCardProps {
  title: string
  labels?: CardLabelViewModel[]
  priority?: CardPriorityViewModel | null
  /** O prazo e a regra de "perto" do projeto (Ciclo). */
  due?: { day: string; soonDays: number } | null
  points?: number | null
  /** O nome de quem esta com o card: a previa mostra as iniciais. */
  assignee?: string | null
  /** A etiqueta realcada, pelo `PublicId`. Ver `CardLabels`. */
  highlightLabel?: string | null
  className?: string
}

/**
 * Um card de exemplo, para as previas da configuracao: o titulo, as etiquetas, a
 * prioridade, o prazo, os pontos e quem esta com ele. **Puro** — nada aqui pede a API —,
 * e montado com as mesmas pecas da frente do card no quadro (`BoardCardFace`): o que a
 * previa mostra e o que o time vai ver.
 */
export function MiniCard({
  title,
  labels = [],
  priority = null,
  due = null,
  points = null,
  assignee = null,
  highlightLabel = null,
  className,
}: MiniCardProps) {
  const temPe = priority !== null || points !== null || assignee !== null

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface p-3 text-left shadow-xs',
        className,
      )}
    >
      <p className="line-clamp-3 break-words text-body text-fg leading-snug">{title}</p>

      <CardLabels labels={labels} highlight={highlightLabel} className="mt-2" />

      {due && (
        <div className="mt-2 text-caption text-fg-muted">
          <DueChip day={due.day} soonDays={due.soonDays} compact />
        </div>
      )}

      {temPe && (
        <div className="mt-2.5 flex items-center justify-between gap-2 text-caption text-fg-muted">
          <div className="flex min-w-0 items-center">
            {priority && <PriorityIcon priority={priority} />}
          </div>
          <span className="flex flex-none items-center gap-1.5">
            <PointsChip points={points} />
            {assignee && (
              <PersonAvatar
                pessoa={{ UserPublicId: '', Name: assignee, AvatarUrl: null, InTeam: true }}
              />
            )}
          </span>
        </div>
      )}
    </div>
  )
}
