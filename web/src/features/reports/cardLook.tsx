import { type ReactNode, useState } from 'react'
import type {
  CardAssigneeViewModel,
  CardColor,
  CardLabelViewModel,
  CardParentViewModel,
  CardPriorityViewModel,
  ReportStateCountViewModel,
  ReportSummaryViewModel,
} from '@/contracts'
import { CARD_COLOR_CLASSES, CARD_COLOR_GLYPH } from '@/shared/components/CardChip'
import { cn } from '@/shared/lib/cn'
import { teamTypeLabel } from '@/shared/lib/teamReportTypes'

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

interface TypeLook {
  label: string
  color: CardColor
  glyph: ReactNode
}

/**
 * Um desenho por tipo, cada um com forma propria: o defeito e um ponto, a melhoria
 * uma seta para cima, a duvida uma interrogacao, e o card do time tres linhas de uma
 * tarefa — e nao um visto, que no quadro ja quer dizer a coluna que encerra.
 */
function typeLook(card: Pick<ReportSummaryViewModel, 'Kind' | 'Type'>): TypeLook {
  if (card.Kind === 'Team')
    return { label: 'Do time', color: 'Blue', glyph: <path d="M3.6 4h4.8M3.6 6h4.8M3.6 8h3" /> }

  switch (card.Type) {
    case 'Bug':
      return {
        label: teamTypeLabel('Bug'),
        color: 'Red',
        glyph: <circle cx="6" cy="6" r="2.2" fill="currentColor" stroke="none" />,
      }
    case 'Improvement':
      return {
        label: teamTypeLabel('Improvement'),
        color: 'Green',
        glyph: <path d="M6 8.8V3.4M3.8 5.6 6 3.4l2.2 2.2" />,
      }
    case 'Question':
      return {
        label: teamTypeLabel('Question'),
        color: 'Purple',
        glyph: (
          <>
            <path d="M4.5 4.7a1.6 1.6 0 1 1 2.2 1.4c-.5.2-.7.6-.7 1.1" />
            <circle cx="6" cy="8.9" r=".55" fill="currentColor" stroke="none" />
          </>
        ),
      }
    default:
      // Tipo que esta versao ainda nao conhece: aparece com o proprio nome, num
      // desenho neutro, em vez de sumir.
      return {
        label: card.Type ? teamTypeLabel(card.Type) : 'Relato',
        color: 'Gray',
        glyph: <circle cx="6" cy="6" r="2" />,
      }
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

/** O nome da prioridade como a tela escreve: a aposentada vem marcada. */
export function priorityName(priority: CardPriorityViewModel) {
  return priority.IsActive ? priority.Name : `${priority.Name} (aposentada)`
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

/**
 * O pai da subtarefa, numa linha: o numero e o titulo dele. **Texto, e nao link**: na
 * frente do card e na linha da tabela, o clique abre a propria subtarefa — e o pai
 * esta a um clique, dentro dela.
 */
export function ParentLine({
  parent,
  className,
}: {
  parent: CardParentViewModel
  className?: string
}) {
  return (
    <span
      title={`Subtarefa de #${parent.Number} ${parent.Headline}`}
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
        <path d="M3 2v4.5a1.5 1.5 0 0 0 1.5 1.5H10M7.5 5.5 10 8l-2.5 2.5" />
      </svg>
      <span className="sr-only">Subtarefa de </span>
      <span className="flex-none font-mono">#{parent.Number}</span>{' '}
      <span className="min-w-0 truncate">{parent.Headline}</span>
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
