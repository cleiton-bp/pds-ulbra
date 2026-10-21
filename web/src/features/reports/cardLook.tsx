import type { ReactNode } from 'react'
import type {
  CardColor,
  CardParentViewModel,
  ReportStateCountViewModel,
  ReportSummaryViewModel,
} from '@/contracts'
import { CARD_COLOR_CLASSES } from '@/shared/components/CardChip'
import { ReportTypeGlyph, reportTypeName } from '@/shared/components/ReportTypeGlyph'
import { cn } from '@/shared/lib/cn'

// As pecas que as previas da configuracao tambem desenham moram em `shared`; daqui
// continuam saindo, para quem ja importava de `cardLook` nao mudar.
export {
  initialsOf,
  MoreLabels,
  PersonAvatar,
  PriorityIcon,
  priorityName,
} from '@/shared/components/cardFace'

/**
 * As pecas que a lista, o quadro e o card aberto desenham igual: o tipo, a
 * prioridade, a coluna e quem esta com o card. Ficam juntas para o mesmo card ter a
 * mesma cara nas tres — quem aprende o desenho numa tela le as outras.
 *
 * **Cor nunca sozinha.** O tipo muda de desenho, a coluna e a prioridade vem com o
 * nome escrito, e quem nao ve tem o nome no texto para leitor de tela.
 */

/** O titulo que a tela mostra: o do time, senao o de quem relatou. Nulo quando nao ha nenhum. */
export function cardTitle(card: Pick<ReportSummaryViewModel, 'Title' | 'ReporterTitle'>) {
  return card.Title ?? card.ReporterTitle
}

/** Quanto do texto vai para a linha e para a frente do card sem titulo. */
const TRECHO = 140

/**
 * O que a linha e a frente do card mostram como titulo: o titulo, senao **o comeco**
 * do texto de quem relatou — e nao o texto inteiro. A tela ja corta o que nao cabe,
 * mas o texto cortado so com CSS continuava inteiro no documento, e virava o nome do
 * link para quem usa leitor de tela: novecentas letras a cada card.
 */
export function cardHeadline(
  card: Pick<ReportSummaryViewModel, 'Title' | 'ReporterTitle' | 'Text'>,
): { text: string; titled: boolean } {
  const titulo = cardTitle(card)
  if (titulo) return { text: titulo, titled: true }

  const texto = (card.Text ?? '').replace(/\s+/g, ' ').trim()
  if (texto.length <= TRECHO) return { text: texto, titled: false }

  // Corta no fim de uma palavra, quando ha uma perto do limite.
  const corte = texto.lastIndexOf(' ', TRECHO)
  return { text: `${texto.slice(0, corte > TRECHO * 0.6 ? corte : TRECHO)}…`, titled: false }
}

/**
 * O titulo como a tela o escreve. O relato sem titulo mostra o comeco do texto **entre
 * aspas, na cor do titulo** — e a fala de quem relatou —, e nao apagado: em lista,
 * cinza quer dizer inativo, e o relato e muitas vezes o mais urgente. O tipo ja diz
 * que e relato; as aspas dizem de quem e a frase.
 *
 * So o texto da tela: o nome do link e o rotulo de leitor de tela ficam com
 * `cardHeadline().text`, sem as aspas.
 */
export function headlineText(headline: { text: string; titled: boolean }): string {
  return headline.titled ? headline.text : `“${headline.text}”`
}

interface TypeLook {
  label: string
  color: CardColor
  glyph: ReactNode
}

/**
 * O desenho do tipo: **a cor e o desenho que o time escolheu** para aquele tipo de
 * relato, na tela Tipos de relato — os desenhos moram em `ReportTypeGlyph`. O card do
 * time tem o seu, fixo: tres linhas de uma tarefa, e nao um visto, que no quadro ja
 * quer dizer a coluna que encerra.
 */
function typeLook(card: Pick<ReportSummaryViewModel, 'Kind' | 'Type'>): TypeLook {
  if (card.Kind === 'Team')
    return { label: 'Do time', color: 'Blue', glyph: <path d="M3.6 4h4.8M3.6 6h4.8M3.6 8h3" /> }

  // Relato sem tipo nao deveria existir; se chegar, aparece neutro, em vez de sumir.
  if (!card.Type) return { label: 'Relato', color: 'Gray', glyph: <circle cx="6" cy="6" r="2" /> }

  return {
    label: reportTypeName(card.Type),
    color: card.Type.Color,
    glyph: <ReportTypeGlyph icon={card.Type.Icon} />,
  }
}

/** O tipo do card, num quadradinho. O nome vai no `title` e para leitor de tela. */
export function CardTypeIcon({ card }: { card: Pick<ReportSummaryViewModel, 'Kind' | 'Type'> }) {
  const { label, color, glyph } = typeLook(card)

  return (
    <span
      title={label}
      className={cn(
        'inline-flex size-4 flex-none items-center justify-center rounded-sm border',
        CARD_COLOR_CLASSES[color],
      )}
    >
      <svg
        viewBox="0 0 12 12"
        className="size-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {glyph}
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  )
}

/** O tom da coluna: por fazer, fazendo ou feito. */
export type StatusTone = 'todo' | 'doing' | 'done'

const TONE_CLASSES: Record<StatusTone, string> = {
  todo: CARD_COLOR_CLASSES.Gray,
  doing: CARD_COLOR_CLASSES.Blue,
  done: CARD_COLOR_CLASSES.Green,
}

/** As classes do tom, para o seletor de coluna do card aberto vestir a mesma cor. */
export function statusToneClasses(tone: StatusTone) {
  return TONE_CLASSES[tone]
}

/**
 * O tom de uma coluna, tirado do que o projeto ja diz: **a coluna que encerra e o
 * feito**, a primeira ativa e o por fazer, e as do meio sao o fazendo. Sem coluna,
 * aposentada ou ainda sem a contagem, o tom neutro.
 *
 * **Com uma coluna ativa so, nada e feito.** O projeto nasce assim, e a unica coluna e
 * tambem a que encerra: pintar todo card de verde diria "feito" sobre o que acabou de
 * chegar. E a mesma regra da ultima coluna do quadro, que so vale com mais de uma.
 *
 * De proposito, nao e configuracao: o projeto que encerra por botao nao tem coluna de
 * feito, e e isso que a tela mostra — nenhuma coluna verde.
 */
export function statusTone(
  statePublicId: string | null,
  colunas: ReportStateCountViewModel[] | null,
): StatusTone {
  if (statePublicId === null || colunas === null) return 'todo'

  const coluna = colunas.find((item) => item.StatePublicId === statePublicId)
  if (!coluna?.IsActive) return 'todo'

  const ativas = colunas.filter((item) => item.StatePublicId !== null && item.IsActive)
  if (ativas.length < 2) return 'todo'
  if (coluna.ClosesReport) return 'done'

  return ativas[0]?.StatePublicId === statePublicId ? 'todo' : 'doing'
}

/**
 * A coluna do card, como selo: o nome em caixa alta, na cor do tom. O nome que nao
 * cabe e cortado, e vai inteiro no `title` — a coluna tem o nome que o time quis.
 */
export function StatusLozenge({
  name,
  tone,
  className,
}: {
  name: string
  tone: StatusTone
  className?: string
}) {
  return (
    <span
      title={name}
      className={cn(
        'inline-flex max-w-full items-center rounded-sm border px-1.5 py-px font-semibold text-caption uppercase tracking-wide',
        TONE_CLASSES[tone],
        className,
      )}
    >
      <span className="truncate">{name}</span>
    </span>
  )
}

/**
 * O original do duplicado, numa linha: dois quadrados sobrepostos, o "Duplicado de", o
 * numero e o titulo dele. **Texto, e nao link**: na linha da tabela, o clique abre o
 * proprio duplicado — e o original esta a um clique, dentro dele.
 */
export function DuplicateLine({
  original,
  className,
}: {
  original: CardParentViewModel
  className?: string
}) {
  return (
    <span
      title={`Duplicado de #${original.Number} ${original.Headline}`}
      className={cn('flex min-w-0 items-center gap-1 text-caption text-fg-muted', className)}
    >
      <svg
        viewBox="0 0 12 12"
        className="size-3 flex-none"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M4 4.2V2.8A.8.8 0 0 1 4.8 2h4.4a.8.8 0 0 1 .8.8v4.4a.8.8 0 0 1-.8.8H7.8M2.8 4.2h4.4a.8.8 0 0 1 .8.8v4.4a.8.8 0 0 1-.8.8H2.8a.8.8 0 0 1-.8-.8V5a.8.8 0 0 1 .8-.8Z" />
      </svg>
      <span className="flex-none">Duplicado de</span>
      <span className="flex-none font-mono">#{original.Number}</span>{' '}
      <span className="min-w-0 truncate">{original.Headline}</span>
    </span>
  )
}

/**
 * Por que o pai esta aqui: a subtarefa nao aparece sozinha na tela de Trabalho, e o
 * filtro de responsavel e a busca trazem o pai no lugar dela. "1 subtarefa sua", "2
 * subtarefas de Ana", "na subtarefa" — quem procura sabe que o que busca esta dentro.
 * Sem filtro, ou sem subtarefa que case, nada.
 */
export function SubtaskMatchMark({
  card,
  className,
}: {
  card: Pick<ReportSummaryViewModel, 'SubtaskMatch'>
  className?: string
}) {
  const marca = card.SubtaskMatch
  if (!marca) return null
  const partes = marca.Assignees.map((pessoa) => {
    const quantas = pessoa.Count === 1 ? '1 subtarefa' : `${pessoa.Count} subtarefas`
    if (pessoa.IsMe) return `${quantas} ${pessoa.Count === 1 ? 'sua' : 'suas'}`
    // So o primeiro nome: a marca e curta, e o nome inteiro fica no responsavel dela.
    return `${quantas} de ${pessoa.Name.split(' ')[0] || pessoa.Name}`
  })
  if (marca.Search) partes.push('na subtarefa')
  if (partes.length === 0) return null
  const texto = partes.join(' · ')
  return (
    <span
      title={`Achado pela subtarefa: ${texto}`}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border border-chip-blue-border bg-chip-blue-surface px-1.5 py-px text-caption text-chip-blue-fg',
        className,
      )}
    >
      <svg
        viewBox="0 0 12 12"
        className="size-3 flex-none"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 2v4.5a1.5 1.5 0 0 0 1.5 1.5H10M7.5 5.5 10 8l-2.5 2.5" />
      </svg>
      <span className="truncate">{texto}</span>
    </span>
  )
}

/**
 * O progresso do pai: quantas subtarefas terminaram, de quantas. Verde quando todas
 * terminaram — e com as palavras para quem nao ve a cor.
 */
export function SubtaskProgress({
  card,
}: {
  card: Pick<ReportSummaryViewModel, 'SubtaskCount' | 'SubtasksDone'>
}) {
  if (card.SubtaskCount === 0) return null
  const todas = card.SubtasksDone === card.SubtaskCount
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 tabular-nums',
        todas ? 'text-chip-green-glyph' : 'text-fg-muted',
      )}
    >
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
        <path d="M2.5 3.5h2M2.5 7h2M2.5 10.5h2M6.5 3.5h5M6.5 7h5M6.5 10.5h5" />
      </svg>
      <span aria-hidden>
        {card.SubtasksDone}/{card.SubtaskCount}
      </span>
      <span className="sr-only">
        {card.SubtasksDone} de {card.SubtaskCount}{' '}
        {card.SubtaskCount === 1 ? 'subtarefa feita' : 'subtarefas feitas'}
      </span>
    </span>
  )
}

/**
 * O card bloqueado: os numeros de quem o bloqueia e ainda nao terminou. **So marca** —
 * mover continua livre. Vermelho, com a palavra, para quem nao ve a cor.
 */
export function BlockedMark({
  card,
  className,
}: {
  card: Pick<ReportSummaryViewModel, 'BlockedBy'>
  className?: string
}) {
  if (card.BlockedBy.length === 0) return null
  const numeros = card.BlockedBy.map((numero) => `#${numero}`)
  const lista =
    numeros.length === 1
      ? numeros[0]
      : `${numeros.slice(0, -1).join(', ')} e ${numeros[numeros.length - 1]}`
  return (
    <span
      title={`Bloqueado por ${lista}`}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border border-chip-red-border bg-chip-red-surface px-1.5 py-px text-caption text-chip-red-fg',
        className,
      )}
    >
      <svg
        viewBox="0 0 12 12"
        className="size-3 flex-none"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        aria-hidden
      >
        <circle cx="6" cy="6" r="4.25" />
        <path d="M3 9 9 3" />
      </svg>
      <span className="truncate">Bloqueado por {lista}</span>
    </span>
  )
}

/**
 * "Origem bloqueada": o relato veio de um endereco que o projeto bloqueou, e o time
 * ainda nao decidiu se fica com ele. **So marca** — o card anda como qualquer outro, e
 * a decisao (manter ou apagar de vez) e de quem administra, pelo lote da lista ou pela
 * tela de Dominios. Laranja, com a palavra, para quem nao ve a cor.
 */
export function BlockedOriginMark({
  card,
  className,
}: {
  card: Pick<ReportSummaryViewModel, 'BlockedOrigin' | 'Origin'>
  className?: string
}) {
  if (!card.BlockedOrigin) return null
  return (
    <span
      title={
        card.Origin
          ? `Veio de ${card.Origin}, um domínio que o projeto bloqueou`
          : 'Veio de um domínio que o projeto bloqueou'
      }
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border border-chip-orange-border bg-chip-orange-surface px-1.5 py-px text-caption text-chip-orange-fg',
        className,
      )}
    >
      <svg
        viewBox="0 0 12 12"
        className="size-3 flex-none"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        aria-hidden
      >
        <circle cx="6" cy="6" r="4.25" />
        <path d="M3.5 6h5" />
      </svg>
      <span className="truncate">Origem bloqueada</span>
    </span>
  )
}
